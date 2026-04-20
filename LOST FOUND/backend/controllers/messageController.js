const mongoose = require("mongoose");
const Message = require("../models/Message");
const PostItem = require("../models/PostItem");
const User = require("../models/User");

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value));

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sanitizeMessage = (msg, currentUserId) => ({
  _id: msg._id,
  itemId: msg.itemId,
  senderId: msg.senderId,
  receiverId: msg.receiverId,
  content: msg.content,
  imageUrl: msg.imageUrl,
  imageName: msg.imageName,
  imageType: msg.imageType,
  createdAt: msg.createdAt,
  updatedAt: msg.updatedAt,
  editedAt: msg.editedAt,
  isMine: String(msg.senderId?._id || msg.senderId) === String(currentUserId),
  isRead:
    Array.isArray(msg.readBy) &&
    msg.readBy.some((id) => String(id) === String(currentUserId)),
});

const conversationKey = (item, otherUser) => {
  const itemKey = item?._id ? String(item._id) : "direct";
  const userKey = String(otherUser?._id || otherUser || "unknown");
  return `${itemKey}:${userKey}`;
};

const startConversation = async (req, res) => {
  try {
    const currentUserId = req.user?._id;
    const { itemId } = req.body;

    if (!isValidObjectId(itemId)) {
      return res.status(400).json({ message: "Invalid item id" });
    }

    const item = await PostItem.findById(itemId)
      .select("itemName category image userId")
      .populate("userId", "name email");

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    const owner = item.userId;
    const ownerId = owner?._id || owner;

    if (!ownerId) {
      return res.status(400).json({ message: "Item owner not available" });
    }

    if (String(ownerId) === String(currentUserId)) {
      return res.status(403).json({ message: "You cannot message your own item" });
    }

    const conversation = {
      item: {
        _id: item._id,
        itemName: item.itemName,
        category: item.category,
        image: item.image,
      },
      otherUser: {
        _id: owner?._id || ownerId,
        name: owner?.name || "Item Owner",
        email: owner?.email || item.email || "",
      },
      latestMessage: null,
      unreadCount: 0,
    };

    const latestMessage = await Message.findOne({
      itemId: item._id,
      participants: {
        $all: [toObjectId(currentUserId), toObjectId(ownerId)],
      },
    })
      .sort({ createdAt: -1 })
      .populate("senderId", "name email")
      .populate("receiverId", "name email")
      .lean();

    if (latestMessage) {
      conversation.latestMessage = sanitizeMessage(latestMessage, currentUserId);
    }

    return res.status(200).json(conversation);
  } catch (error) {
    return res.status(500).json({ message: "Failed to start conversation", error: error.message });
  }
};

const getConversations = async (req, res) => {
  try {
    const currentUserId = String(req.user?._id);

    const messages = await Message.find({ participants: toObjectId(currentUserId) })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate("itemId", "itemName category image")
      .populate("senderId", "name email")
      .populate("receiverId", "name email")
      .lean();

    const conversations = new Map();

    messages.forEach((msg) => {
      const senderId = String(msg.senderId?._id || msg.senderId);
      const receiverId = String(msg.receiverId?._id || msg.receiverId);
      const otherUser = senderId === currentUserId ? msg.receiverId : msg.senderId;
      const key = conversationKey(msg.itemId, otherUser);

      if (!conversations.has(key)) {
        conversations.set(key, {
          item: msg.itemId,
          otherUser,
          latestMessage: sanitizeMessage(msg, currentUserId),
          unreadCount: 0,
        });
      }

      const current = conversations.get(key);
      const isUnreadForCurrent =
        receiverId === currentUserId &&
        !msg.readBy?.some((id) => String(id) === currentUserId);

      if (isUnreadForCurrent) {
        current.unreadCount += 1;
      }
    });

    return res.status(200).json(Array.from(conversations.values()));
  } catch (error) {
    return res.status(500).json({ message: "Failed to load conversations", error: error.message });
  }
};

const getThreadMessages = async (req, res) => {
  try {
    const currentUserId = req.user?._id;
    const { itemId, userId } = req.query;

    if (!isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid conversation parameters" });
    }

    const normalizedItemId = itemId ? String(itemId) : null;
    const isDirectConversation = !normalizedItemId || normalizedItemId === "direct";

    if (!isDirectConversation && !isValidObjectId(normalizedItemId)) {
      return res.status(400).json({ message: "Invalid conversation parameters" });
    }

    const query = {
      participants: {
        $all: [toObjectId(currentUserId), toObjectId(userId)],
      },
      ...(isDirectConversation
        ? { itemId: null }
        : { itemId: toObjectId(normalizedItemId) }),
    };

    const messages = await Message.find(query)
      .sort({ createdAt: 1 })
      .limit(400)
      .populate("senderId", "name email")
      .populate("receiverId", "name email")
      .lean();

    await Message.updateMany(
      {
        ...(isDirectConversation
          ? { itemId: null }
          : { itemId: toObjectId(normalizedItemId) }),
        senderId: toObjectId(userId),
        receiverId: toObjectId(currentUserId),
        readBy: { $ne: toObjectId(currentUserId) },
      },
      {
        $addToSet: { readBy: toObjectId(currentUserId) },
      },
    );

    return res.status(200).json(messages.map((msg) => sanitizeMessage(msg, currentUserId)));
  } catch (error) {
    return res.status(500).json({ message: "Failed to load thread messages", error: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const currentUserId = req.user?._id;
    const { itemId, receiverId } = req.body;

    if (!isValidObjectId(receiverId)) {
      return res.status(400).json({ message: "Invalid message parameters" });
    }

    const normalizedItemId = itemId ? String(itemId) : null;
    const isDirectConversation = !normalizedItemId || normalizedItemId === "direct";

    if (!isDirectConversation && !isValidObjectId(normalizedItemId)) {
      return res.status(400).json({ message: "Invalid message parameters" });
    }

    const text = String(req.body?.content || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    const imageName = String(req.body?.imageName || "").trim();
    const imageType = String(req.body?.imageType || "").trim();

    if (!text && !imageUrl) {
      return res.status(400).json({ message: "Message content or image is required" });
    }

    if (String(currentUserId) === String(receiverId)) {
      return res.status(400).json({ message: "Cannot send a message to yourself" });
    }

    if (!isDirectConversation) {
      const item = await PostItem.findById(normalizedItemId).select("_id userId");
      if (!item) {
        return res.status(404).json({ message: "Item not found" });
      }
    }

    const message = await Message.create({
      itemId: isDirectConversation ? null : toObjectId(normalizedItemId),
      senderId: toObjectId(currentUserId),
      receiverId: toObjectId(receiverId),
      content: text,
      imageUrl,
      imageName,
      imageType,
      readBy: [toObjectId(currentUserId)],
    });

    const saved = await Message.findById(message._id)
      .populate("senderId", "name email")
      .populate("receiverId", "name email")
      .lean();

    return res.status(201).json(sanitizeMessage(saved, currentUserId));
  } catch (error) {
    return res.status(500).json({ message: "Failed to send message", error: error.message });
  }
};

const editMessage = async (req, res) => {
  try {
    const currentUserId = req.user?._id;
    const { messageId } = req.params;

    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (String(message.senderId) !== String(currentUserId)) {
      return res.status(403).json({ message: "You can only edit your own messages" });
    }

    const content = String(req.body?.content || "").trim();

    if (!content && !message.imageUrl) {
      return res.status(400).json({ message: "Message content is required" });
    }

    message.content = content;
    message.editedAt = new Date();
    await message.save();

    const saved = await Message.findById(message._id)
      .populate("senderId", "name email")
      .populate("receiverId", "name email")
      .lean();

    return res.status(200).json(sanitizeMessage(saved, currentUserId));
  } catch (error) {
    return res.status(500).json({ message: "Failed to edit message", error: error.message });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const currentUserId = req.user?._id;
    const { messageId } = req.params;

    if (!isValidObjectId(messageId)) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    if (String(message.senderId) !== String(currentUserId)) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    await Message.deleteOne({ _id: message._id });

    return res.status(200).json({ message: "Message deleted", messageId: message._id });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete message", error: error.message });
  }
};

const startConversationByEmail = async (req, res) => {
  try {
    const currentUserId = req.user?._id;
    const currentEmail = String(req.user?.email || "").trim().toLowerCase();
    const normalizedEmail = String(req.body?.email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).json({ message: "Email is required" });
    }

    const targetUser = await User.findOne({
      email: { $regex: `^${escapeRegex(normalizedEmail)}$`, $options: "i" },
    }).select("name email");

    if (!targetUser) {
      return res.status(404).json({ message: "User not found with this email" });
    }

    if (String(targetUser._id) === String(currentUserId) || normalizedEmail === currentEmail) {
      return res.status(400).json({ message: "You cannot start a chat with your own account" });
    }

    const latestMessage = await Message.findOne({
      itemId: null,
      participants: {
        $all: [toObjectId(currentUserId), toObjectId(targetUser._id)],
      },
    })
      .sort({ createdAt: -1 })
      .populate("senderId", "name email")
      .populate("receiverId", "name email")
      .lean();

    return res.status(200).json({
      item: null,
      otherUser: {
        _id: targetUser._id,
        name: targetUser.name || targetUser.email,
        email: targetUser.email,
      },
      latestMessage: latestMessage
        ? sanitizeMessage(latestMessage, currentUserId)
        : null,
      unreadCount: 0,
      conversationType: "direct",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to start direct conversation",
      error: error.message,
    });
  }
};

module.exports = {
  startConversation,
  startConversationByEmail,
  getConversations,
  getThreadMessages,
  sendMessage,
  editMessage,
  deleteMessage,
};
