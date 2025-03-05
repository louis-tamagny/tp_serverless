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
    accessKeyId: 'xxxx',
    secretAccessKey: 'xxxx',
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
  try {
    // Adjust the path if your file is in a different directory
    const filePath = 'form.html';
    const fileContent = fs.readFileSync(filePath, 'utf8');

    return {
      statusCode: 200,
      body: fileContent,
      headers: {
        'Content-Type': 'text/html',
      },
    };
  } catch (err) {
    console.error('Error reading index.html:', err);
    return {
      statusCode: 500,
      body: 'Internal Server Error',
    };
  }
};
exports.upload = async (event) => {
  // Check if the event is base64 encoded
  const bodyBuffer = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
  const result = parseMultiPart.parse({ ...event, body: bodyBuffer.toString('binary') }, true);

  // Process the parsed data
  const memeText = result.memeText;
  const name = result.name;
  const file = result.file;

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

  const lineHeight = image.height / 10
  // Paramètres
  ctx.font = `bold ${lineHeight}px "Arial"`;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 0.6;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Appel de la fonction avec une largeur maximale et un espacement entre les lignes
  wrapText(ctx, memeText, 0, 0, image.width, lineHeight);  // maxWidth = 300, lineHeight = 20


  // Convert canvas to buffer
  const buffer = canvas.toBuffer('image/png');

  // Upload to MinIO
  const fileName = `meme-${file.filename}.png`;

  await minioClient.putObject(bucketName, fileName, buffer);

  const params = {
    TableName: TABLE_NAME,
    Item: {
      key: name,
      filename: fileName,
      createdAt: new Date().toISOString(),
    },
  };

  try {
    await dynamoDb.put(params).promise();
    console.log('Item successfully added to DynamoDB');
  } catch (err) {
    console.error('Error adding item to DynamoDB:', err);
  }

  if (!memeText || !file) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Could not parse form data correctly" }),
    };
  }

  // Further processing...
  return { statusCode: 301, headers: { Location: `download/${name}` } };
};

exports.download = async (event) => {
  const { key } = event.pathParameters;
  const params = {
    TableName: TABLE_NAME,
    Key: {
      key: key,
    },
  };

  const { Item } = await dynamoDb.get(params).promise();

  const filePath = 'tmp/' + Item.filename;

  // Provide a valid path for file download in MinIO
  await minioClient.fGetObject(bucketName, Item.filename, filePath);

  // Read the file contents and return as body
  const fileContent = fs.readFileSync(filePath);

  return {
    statusCode: 200,
    body: fileContent.toString('base64'), // Convert buffer to base64 string
    isBase64Encoded: true,
    headers: {
      'Content-Type': 'image/png',  // Adjust the mime type as needed
      'Content-Disposition': `inline; filename="${Item.filename}"`,
    },
  };
}

exports.listMeme = async (event) => {
  const params = {
    TableName: TABLE_NAME,
  };

  const { Items } = await dynamoDb.scan(params).promise();

  return {
    statusCode: 200,
    body: JSON.stringify(Items),
  };
};
