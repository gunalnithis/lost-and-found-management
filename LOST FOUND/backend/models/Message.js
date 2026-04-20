const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostItem",
      required: false,
      default: null,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    participants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: false,
      trim: true,
      maxlength: 2000,
      default: "",
    },
    imageUrl: {
      type: String,
      required: false,
      default: "",
    },
    imageName: {
      type: String,
      required: false,
      default: "",
    },
    imageType: {
      type: String,
      required: false,
      default: "",
    },
    readBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    editedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

messageSchema.pre("validate", function setParticipants() {
  if (this.senderId && this.receiverId) {
    const pair = [String(this.senderId), String(this.receiverId)].sort();
    this.participants = pair;
  }

  if (typeof this.content === "string") {
    this.content = this.content.trim();
  }

  const hasContent = Boolean(this.content);
  const hasImage = Boolean(this.imageUrl);

  if (!hasContent && !hasImage) {
    this.invalidate("content", "Message content or image is required");
  }
});

messageSchema.index({ participants: 1, itemId: 1, createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
