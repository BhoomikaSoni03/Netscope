const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    target: { type: String, required: true },
    type: { type: String, enum: ['ping', 'tcp', 'dns'], default: 'ping' },
    consecutiveFailures: { type: Number, default: 0 },
    threshold: { type: Number, default: 3 },     // failures before alert fires
    triggered: { type: Boolean, default: false }, // has the alert fired?
    lastTriggeredAt: { type: Date, default: null },
    resolved: { type: Boolean, default: false },
    message: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
