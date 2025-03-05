const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamoDb = new AWS.DynamoDB.DocumentClient(
  process.env.IS_OFFLINE && {
    region: "localhost",
    endpoint: "http://localhost:8000",
  }
);

const TABLE_NAME = process.env.DYNAMODB_TABLE;

exports.index = async (event) => {
  return {
    statusCode: 404,
    body: JSON.stringify({
      message: "Url Shortener v1.0",
    }),
  };
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
