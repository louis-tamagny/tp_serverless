# Meme Generator - Local Development

## Prerequisites
- Node.js installed
- Serverless Framework installed (`npm install -g serverless`)

## Starting the Project Locally

```bash
npm install
cd minio
docker-compose up
```

To run the project locally using serverless-offline, use the following command:

```bash
serverless offline start --reloadHandler
```

The API will be available at `http://localhost:3000` by default.

## API Endpoint

`dev/upload` takes form data and upload the image to MinIO then create a record in DynamoDB

`dev/download/{key}` takes the name inputed earlier as a key and return the meme

`dev/listMeme` returns a list of memes
