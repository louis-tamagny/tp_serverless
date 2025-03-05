const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");
const Minio = require('minio');
const fs = require('fs');
const dotenv = require("dotenv");
const parseMultiPart = require('aws-lambda-multipart-parser');

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
  endPoint:process.env.MINIO_ENDPOINT,
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
  console.log('Event Headers:', event.headers);
  console.log('Event Body (Raw):', event.body);

  // Check if the event is base64 encoded
  if (event.isBase64Encoded) {
    console.log('Event Body is Base64 Encoded');
  }

  const result = parseMultiPart.parse(event, true);
  console.log('Parsed Result:', result);

  // Process the parsed data
  const memeText = result.memeText;
  const file = result.file;

  await minioClient.putObject(bucketName, file.filename, Buffer.from(file.content, 'base64'));

  if (!memeText || !file) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Could not parse form data correctly" }),
    };
  }

  // Further processing...
  return { statusCode: 200 };
};

exports.createUrl = async (event) => {
  const { url } = JSON.parse(event.body);
  const key = uuidv4().slice(0, 8);

  const params = {
    TableName: TABLE_NAME,
    Item: {
      key,
      url,
      createdAt: new Date().toISOString(),
      clicks: 0,
    },
  };

  await dynamoDb.put(params).promise();

  return {
    statusCode: 200,
    body: JSON.stringify({ key, shortUrl: `http://localhost:3000/url/${key}` }),
  };
};

exports.listUrls = async (event) => {
  const params = {
    TableName: TABLE_NAME,
  };

  const { Items } = await dynamoDb.scan(params).promise();

  return {
    statusCode: 200,
    body: JSON.stringify(Items),
  };
};

exports.getUrl = async (event) => {
  const { key } = event.pathParameters;

  const params = {
    TableName: TABLE_NAME,
    Key: {
      key,
    },
  };

  const { Item } = await dynamoDb.get(params).promise();

  // Increase the number of clicks
  await dynamoDb
    .update({
      TableName: TABLE_NAME,
      Key: {
        key,
      },
      UpdateExpression: "SET clicks = clicks + :inc",
      ExpressionAttributeValues: {
        ":inc": 1,
      },
    })
    .promise();

  if (!Item) {
    return {
      statusCode: 404,
      body: JSON.stringify({ message: "URL not found" }),
    };
  }

  return {
    statusCode: 301,
    headers: {
      Location: Item.url,
    },
  };
};
