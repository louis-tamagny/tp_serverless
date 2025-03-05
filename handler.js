const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const Minio = require('minio');
const fs = require('fs');
const dotenv = require("dotenv");
const parseMultiPart = require('aws-lambda-multipart-parser');
const { loadImage } = require('canvas');
const { createCanvas } = require('canvas');


dotenv.config();

const dynamoDb = new AWS.DynamoDB.DocumentClient(
  process.env.IS_OFFLINE && {
    region: "localhost",
    endpoint: "http://localhost:8000",
  }
);

const TABLE_NAME = process.env.DYNAMODB_TABLE;

// Initialiser le client MinIO
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY
})

const bucketName = process.env.MINIO_BUCKET;

exports.index = async (event) => {
  return {
    statusCode: 404,
    body: JSON.stringify({
      message: "Url Shortener v1.0",
    }),
  };
};

exports.upload = async (event) => {

  // Check if the event is base64 encoded
  const bodyBuffer = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
  const result = parseMultiPart.parse({ ...event, body: bodyBuffer.toString('binary') }, true);

  // Process the parsed data
  const memeText = result.memeText.toString('utf-8');
  const file = result.file;

  if (!memeText || !file) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Could not parse form data correctly" }),
    };
  }

  // Load image and create meme
  const image = await loadImage(`data:${file.contentType};base64,${file.content.toString('base64')}`);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');




  ctx.drawImage(image, 0, 0);

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');  // Sépare le texte en mots
    let line = '';

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const testWidth = ctx.measureText(testLine).width;

      // Si la largeur dépasse maxWidth, dessine la ligne actuelle et passe à la suivante
      if (testWidth > maxWidth) {
        ctx.fillText(line, x, y);
        ctx.strokeText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }

      // Dessine la dernière ligne
      ctx.fillText(line, x, y);
      ctx.strokeText(line, x, y);
    }
  }

  // Paramètres
  ctx.font = 'bold 16px "Arial"';
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 0.6;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Appel de la fonction avec une largeur maximale et un espacement entre les lignes
  wrapText(ctx, memeText, 0, 0, image.width, 20);  // maxWidth = 300, lineHeight = 20


  // Convert canvas to buffer
  const buffer = canvas.toBuffer('image/png');

  // Upload to MinIO
  const fileName = `meme-${file.filename}.png`;
  await minioClient.putObject(bucketName, fileName, buffer);

  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Meme created successfully", fileName }),
  };
};
