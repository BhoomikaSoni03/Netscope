const mongoose = require('mongoose');

const networkLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['ping', 'tcp', 'dns'],
      required: true,
    },
    target: {
      type: String,
      required: true,
    },
    port: {
      type: Number,
      default: null,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['success', 'failed', 'failure', 'timeout'],
      required: true,
    },
    fromCache: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('NetworkLog', networkLogSchema);
