import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
// import fetch from 'node-fetch';
import OpenAI from 'openai';
import { Readable } from 'stream';
import { Buffer } from 'buffer';

const openai = new OpenAI();
const s3Client = new S3Client({ region: 'us-west-1' });
const snsClient = new SNSClient({ region: 'us-west-1' });

// Initialize AWS SDK clients
// const s3Client = new S3Client({ region: 'us-west-1' }); // Replace with your AWS region
// const rekognitionClient = new RekognitionClient({ region: 'us-west-1' }); // Replace with your AWS region
// const bucketName = process.env.BUCKET_NAME || 'PhotoIdBucket'; // Replace with your S3 bucket name
const chatGPTApiEndpoint = 'https://api.openai.com/v1/chat/completions'; // Example API endpoint

export const handler = async (event: any) => {
  try {
    let base64Image = '';
    let bucketName;
    let objectKey;

    if (event.Records) {
      // Handle S3 event
      const record = event.Records[0];
      bucketName = record.s3.bucket.name;
      objectKey = record.s3.object.key;

      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });

      const data: any = await s3Client.send(getObjectCommand);
      const stream =
        data.Body instanceof Readable ? data.Body : Readable.from(data.Body);

      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } else {
      // Ensure the request body is correctly base64-encoded
      // const base64Image = event.body?.replace(/^data:image\/\w+;base64,/, '');
      // console.log(event);
      const requestBody = JSON.parse(event.body || '{}');
      console.log(requestBody);
      const base64Image = requestBody.body;
      if (!base64Image) {
        throw new Error('Invalid image data');
      }
    }

    // Prepare the prompt for the ChatGPT API
    // const prompt = `Identify the species in the following image: ${base64Image}`;

    // console.log(base64Image);
    const chatGPTResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Identify the species in the following image:',
            },
            {
              type: 'image_url',
              image_url: {
                url: base64Image,
              },
            },
          ],
        },
      ],
    });

    console.log(chatGPTResponse);

    // if (!chatGPTResponse.ok) {
    //   throw new Error(`Error from ChatGPT API: ${chatGPTResponse.statusText}`);
    // }

    // const chatGPTData: any = await chatGPTResponse.json();

    if (!chatGPTResponse.choices || chatGPTResponse.choices.length === 0) {
      throw new Error('No choices returned from ChatGPT API');
    }

    const identifiedSpecies =
      chatGPTResponse.choices[0].message?.content?.trim();
    const params = {
      Message: `Image processed successfully. Identified species: ${identifiedSpecies}`,
      TopicArn: process.env.SNS_TOPIC_ARN, // Use the SNS topic ARN from environment variables
    };

    await snsClient.send(new PublishCommand(params));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Image processed successfully',
        chatGPTResponse,
      }),
    };
  } catch (error: any) {
    console.error('Error processing image:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing image',
        error: error.message,
      }),
    };
  }
};
