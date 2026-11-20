const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');

let connectionPromise;
let bucket;

async function connectDatabase(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is required.');
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose.connect(uri, { appName: 'pcos-research-dashboard' })
    .then(() => {
      bucket = new GridFSBucket(mongoose.connection.db, { bucketName: 'medicalUploads' });
      return mongoose.connection;
    })
    .catch((error) => {
      connectionPromise = undefined;
      throw error;
    });
  return connectionPromise;
}

function getUploadBucket() {
  if (!bucket) throw new Error('MongoDB upload storage is not connected.');
  return bucket;
}

function saveUpload(buffer, filename, contentType, ownerId) {
  const uploadStream = getUploadBucket().openUploadStream(filename, {
    contentType,
    metadata: { ownerId: new ObjectId(ownerId) },
  });

  return new Promise((resolve, reject) => {
    uploadStream.once('error', reject);
    uploadStream.once('finish', () => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

function deleteUpload(id) {
  return getUploadBucket().delete(new ObjectId(id));
}

function readUpload(id) {
  return getUploadBucket().openDownloadStream(new ObjectId(id));
}

async function closeDatabase() {
  bucket = undefined;
  connectionPromise = undefined;
  await mongoose.disconnect();
}

module.exports = { connectDatabase, closeDatabase, saveUpload, deleteUpload, readUpload };
