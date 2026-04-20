const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const LostContactRequest = require("../models/LostContactRequest");
const FoundContactRequest = require("../models/FoundContactRequest");
const AdvertisementRequest = require("../models/AdvertisementRequest");
const Feedback = require("../models/Feedback");
const PostItem = require("../models/PostItem");
const { appendTrackingEntry } = require("./itemController");

const EMAIL_USER = process.env.GMAIL_USER || "your-email@gmail.com";
const EMAIL_PASS =
  process.env.GMAIL_APP_PASSWORD ||
  process.env.GMAIL_PASSWORD ||
  "your-app-password";

// Initialize email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

const isEmailConfigured =
  !!EMAIL_USER &&
  !!EMAIL_PASS &&
  EMAIL_USER !== "your-email@gmail.com" &&
  EMAIL_PASS !== "your-app-password";

const sendOwnerNotificationEmail = async (requestData, itemCategory) => {
  if (!isEmailConfigured) {
    return { emailSent: false, reason: "Email is not configured" };
  }

  const categoryLabel = itemCategory === "lost" ? "Lost" : "Found";
  const messageHtml = requestData.message
    ? `<h3>Requester Message:</h3><p>${requestData.message}</p>`
    : "";

  const ownerEmailContent = `
    <h2>New Contact Message for Your ${categoryLabel} Item: ${requestData.itemName}</h2>
    <p>Someone has contacted you about the item you posted.</p>

    <h3>Requester's Contact Information:</h3>
    <p><strong>Name:</strong> ${requestData.name}</p>
    <p><strong>Email:</strong> ${requestData.email}</p>
    <p><strong>Phone:</strong> ${requestData.phone}</p>
    <p><strong>IT Number:</strong> ${requestData.itNumber}</p>
    <p><strong>Studying Year:</strong> ${requestData.studyingYear}</p>

    ${messageHtml}

    <hr>
    <p><em>This is an automated message from Lost & Found System</em></p>
  `;

  await transporter.sendMail({
    from: EMAIL_USER,
    to: requestData.itemOwnerEmail,
    subject: `New Contact Message - ${requestData.itemName}`,
    html: ownerEmailContent,
  });

  return { emailSent: true };
};

const sendMessage = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      itNumber,
      studyingYear,
      message,
      itemId,
    } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !itNumber || !studyingYear || !itemId) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        message: "Invalid item",
      });
    }

    const item = await PostItem.findById(itemId)
      .select("itemName category email userId")
      .populate("userId", "email");

    if (!item) {
      return res.status(404).json({
        message: "Item not found",
      });
    }

    const itemCategory = item.category;
    const ownerId = item.userId?._id || item.userId;
    // Prefer the contact email provided with the item post.
    // Fallback to account email only when post-level email is missing.
    const itemOwnerEmail = item.email || item.userId?.email;
    const itemName = item.itemName;

    if (itemCategory !== "lost" && itemCategory !== "found") {
      return res.status(400).json({
        message: "Invalid item category",
      });
    }

    if (!itemOwnerEmail) {
      return res.status(400).json({
        message: "Item owner email is not available",
      });
    }

    if (
      ownerId &&
      req.user &&
      String(req.user._id) === String(ownerId)
    ) {
      return res.status(403).json({
        message: "You cannot contact your own item",
      });
    }

    const ContactModel =
      itemCategory === "lost" ? LostContactRequest : FoundContactRequest;

    const approvalTimestamp = new Date();

    const request = await ContactModel.create({
      name,
      email,
      phone,
      itNumber,
      studyingYear,
      message,
      itemName,
      itemOwnerEmail,
      itemOwnerId: ownerId,
      requesterId: req.user?._id,
      status: "approved",
      reviewedAt: approvalTimestamp,
      ...(itemCategory === "found" ? { itemId: item._id } : {}),
    });

    if (itemCategory === "found") {
      const foundItem = await PostItem.findById(item._id);
      if (foundItem) {
        appendTrackingEntry(foundItem, "contacted", "A user contacted the finder.");
        appendTrackingEntry(
          foundItem,
          "verifying",
          "Claim request was approved automatically. Finder and claimant are now verifying ownership.",
        );
        await foundItem.save();
      }
    }

    let emailSent = false;
    try {
      const mailResult = await sendOwnerNotificationEmail(request, itemCategory);
      emailSent = !!mailResult.emailSent;
    } catch (mailError) {
      console.error("Email sending failed after automatic notification:", mailError);
    }

    res.status(201).json({
      message: emailSent
        ? "Request submitted successfully and sent to the item owner."
        : "Request submitted successfully and approved automatically, but email notification could not be sent.",
      success: true,
      approvalRequired: false,
      status: "approved",
      emailSent,
      request,
    });
  } catch (error) {
    console.error("Contact request submission error:", error);

    res.status(500).json({
      message: "Failed to submit request. Please try again later.",
      error: error.message,
    });
  }
};

const updateRequestStatus = async (req, res, ContactModel, category) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({
        message: "Status must be either approved or rejected",
      });
    }

    const request = await ContactModel.findById(id);

    if (!request) {
      return res.status(404).json({
        message: "Contact request not found",
      });
    }

    if (request.status && request.status !== "pending") {
      return res.status(400).json({
        message: `Request is already ${request.status}`,
      });
    }

    request.status = status;
    request.reviewedAt = new Date();
    if (req.user?._id) {
      request.reviewedBy = req.user._id;
    }
    await request.save();

    if (category === "found" && request.itemId) {
      const foundItem = await PostItem.findById(request.itemId);
      if (foundItem && foundItem.category === "found") {
        if (status === "approved") {
          appendTrackingEntry(
            foundItem,
            "verifying",
            "Claim request approved. Finder and claimant are now verifying ownership.",
          );
        }
        await foundItem.save();
      }
    }

    if (status === "rejected") {
      return res.status(200).json({
        message: "Request rejected successfully",
        success: true,
        emailSent: false,
        request,
      });
    }

    try {
      const mailResult = await sendOwnerNotificationEmail(request, category);
      return res.status(200).json({
        message: mailResult.emailSent
          ? "Request approved and sent to the item owner"
          : "Request approved, but email notification is not configured",
        success: true,
        emailSent: !!mailResult.emailSent,
        request,
      });
    } catch (mailError) {
      console.error("Email sending failed after approval:", mailError);
      return res.status(200).json({
        message:
          "Request approved successfully, but email notification could not be sent.",
        success: true,
        emailSent: false,
        request,
      });
    }
  } catch (error) {
    res.status(500).json({
      message: "Failed to update request status",
      error: error.message,
    });
  }
};

const updateLostContactRequestStatus = async (req, res) =>
  updateRequestStatus(req, res, LostContactRequest, "lost");

const updateFoundContactRequestStatus = async (req, res) =>
  updateRequestStatus(req, res, FoundContactRequest, "found");

const getLostContactRequests = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const requests = await LostContactRequest.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({
      message: "Failed to load lost contact requests",
      error: error.message,
    });
  }
};

const getFoundContactRequests = async (req, res) => {
  try {
    const includeAll = req.query.includeAll === "true";
    const query = FoundContactRequest.find().sort({ createdAt: -1 });

    if (!includeAll) {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
      query.skip(skip).limit(limit);
    }

    const requests = await query.lean();
    res.status(200).json(requests);
  } catch (error) {
    res.status(500).json({
      message: "Failed to load found contact requests",
      error: error.message,
    });
  }
};

const updateFoundContactRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const request = await FoundContactRequest.findById(id);

    if (!request) {
      return res.status(404).json({ message: "Found contact request not found" });
    }

    const editableFields = [
      "name",
      "email",
      "phone",
      "itNumber",
      "studyingYear",
      "message",
      "itemName",
      "itemOwnerEmail",
    ];

    editableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        request[field] = req.body[field];
      }
    });

    if (req.body.status && ["pending", "approved", "rejected"].includes(req.body.status)) {
      request.status = req.body.status;
      if (req.body.status !== "pending") {
        request.reviewedAt = new Date();
      }
    }

    const updated = await request.save();
    return res.status(200).json(updated);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update found contact request",
      error: error.message,
    });
  }
};

const deleteFoundContactRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedRequest = await FoundContactRequest.findByIdAndDelete(id);

    if (!deletedRequest) {
      return res.status(404).json({ message: "Found contact request not found" });
    }

    return res.status(200).json({
      message: "Found contact request deleted successfully",
      deletedId: deletedRequest._id,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete found contact request",
      error: error.message,
    });
  }
};

const getMyContactRequestNotifications = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    const requesterQuery = {
      $or: [{ requesterId: req.user._id }, { email: req.user.email }],
      status: { $in: ["approved", "rejected"] },
      dismissedByRequester: { $ne: true },
    };

    const [lostRequests, foundRequests] = await Promise.all([
      LostContactRequest.find(requesterQuery)
        .select("itemName status reviewedAt createdAt")
        .lean(),
      FoundContactRequest.find(requesterQuery)
        .select("itemName status reviewedAt createdAt")
        .lean(),
    ]);

    const notifications = [
      ...lostRequests.map((request) => ({
        ...request,
        category: "lost",
      })),
      ...foundRequests.map((request) => ({
        ...request,
        category: "found",
      })),
    ].sort((a, b) => {
      const aTime = new Date(a.reviewedAt || a.createdAt).getTime();
      const bTime = new Date(b.reviewedAt || b.createdAt).getTime();
      return bTime - aTime;
    });

    return res.status(200).json(notifications);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load notifications",
      error: error.message,
    });
  }
};

const dismissContactRequestNotification = async (req, res) => {
  try {
    const { category, id } = req.params;

    if (!req.user?._id) {
      return res.status(401).json({ message: "Not authorized" });
    }

    let ContactModel;
    if (category === "lost") {
      ContactModel = LostContactRequest;
    } else if (category === "found") {
      ContactModel = FoundContactRequest;
    } else {
      return res.status(400).json({ message: "Invalid category" });
    }

    const request = await ContactModel.findById(id);
    if (!request) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const isRequester =
      (request.requesterId && String(request.requesterId) === String(req.user._id)) ||
      (request.email && request.email === req.user.email);

    if (!isRequester) {
      return res.status(403).json({ message: "Not allowed to dismiss this notification" });
    }

    request.dismissedByRequester = true;
    request.dismissedAt = new Date();
    await request.save();

    return res.status(200).json({
      success: true,
      message: "Notification dismissed",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to dismiss notification",
      error: error.message,
    });
  }
};

const getAdminNotifications = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);

    const [lostPending, foundPending, adPending, feedbackPending] =
      await Promise.all([
        LostContactRequest.find({ status: "pending" })
          .select("name itemName createdAt")
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
        FoundContactRequest.find({ status: "pending" })
          .select("name itemName createdAt")
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
        AdvertisementRequest.find({ status: "pending" })
          .select("contactName itemName createdAt")
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
        Feedback.find({ status: "pending" })
          .select("name category rating createdAt")
          .sort({ createdAt: -1 })
          .limit(limit)
          .lean(),
      ]);

    const notifications = [
      ...lostPending.map((item) => ({
        id: item._id,
        type: "lost_contact_request",
        status: "pending",
        title: "New Lost Contact Request",
        message: `${item.name || "User"} requested contact for ${item.itemName || "an item"}.`,
        createdAt: item.createdAt,
        link: "/contacts/lost",
      })),
      ...foundPending.map((item) => ({
        id: item._id,
        type: "found_contact_request",
        status: "pending",
        title: "New Found Contact Request",
        message: `${item.name || "User"} requested claim for ${item.itemName || "an item"}.`,
        createdAt: item.createdAt,
        link: "/contacts/found",
      })),
      ...adPending.map((item) => ({
        id: item._id,
        type: "advertisement_request",
        status: "pending",
        title: "New Advertisement Request",
        message: `${item.contactName || "User"} submitted ad request for ${item.itemName || "an item"}.`,
        createdAt: item.createdAt,
        link: "/advertisements/requests",
      })),
      ...feedbackPending.map((item) => ({
        id: item._id,
        type: "feedback",
        status: "pending",
        title: "New Feedback",
        message: `${item.name || "Anonymous"} sent ${item.category || "general"} feedback (Rating: ${item.rating || "-"}/5).`,
        createdAt: item.createdAt,
        link: "/feedbacks",
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);

    return res.status(200).json({
      totalPending: notifications.length,
      notifications,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to load admin notifications",
      error: error.message,
    });
  }
};

module.exports = {
  sendMessage,
  getLostContactRequests,
  getFoundContactRequests,
  updateLostContactRequestStatus,
  updateFoundContactRequestStatus,
  updateFoundContactRequest,
  deleteFoundContactRequest,
  getMyContactRequestNotifications,
  dismissContactRequestNotification,
  getAdminNotifications,
};
