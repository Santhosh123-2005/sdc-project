const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  usernameLower: { type: String, required: true, unique: true },
  email: { type: String, required: true, trim: true },
  emailLower: { type: String, required: true, unique: true },
  role: { type: String, enum: ['Doctor', 'Patient'], required: true },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true });

const diagnosisSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clinicalFeatures: {
    age: { type: Number, required: true },
    bmi: { type: Number, required: true },
    cycleLength: { type: Number, required: true },
    hirsutism: { type: Number, required: true },
    homaIr: { type: Number, required: true },
    lhFsh: { type: Number, required: true },
    follicleCountLeft: { type: Number, required: true },
    follicleCountRight: { type: Number, required: true },
  },
  clinicalPrediction: { type: mongoose.Schema.Types.Mixed, required: true },
  imagePrediction: { type: mongoose.Schema.Types.Mixed, required: true },
  imageFileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  heatmapFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
  clinicalModelVersion: { type: String, required: true },
  imageModelVersion: { type: String, required: true },
  feedback: {
    reviewedLabel: { type: String, enum: ['positive', 'negative'] },
    note: { type: String, maxlength: 1000 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
}, { timestamps: true });

diagnosisSchema.index({ ownerId: 1, createdAt: -1 });

module.exports = {
  User: mongoose.models.User || mongoose.model('User', userSchema),
  Diagnosis: mongoose.models.Diagnosis || mongoose.model('Diagnosis', diagnosisSchema),
};
