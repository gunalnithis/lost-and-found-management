const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const {
  startConversation,
  startConversationByEmail,
  getConversations,
  getThreadMessages,
  sendMessage,
  editMessage,
  deleteMessage,
} = require("../controllers/messageController");

router.use(protect);
router.post("/start", startConversation);
router.post("/start-by-email", startConversationByEmail);
router.get("/conversations", getConversations);
router.get("/thread", getThreadMessages);
router.post("/send", sendMessage);
router.patch("/:messageId", editMessage);
router.delete("/:messageId", deleteMessage);

module.exports = router;
