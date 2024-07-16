import { handler } from '../lambda/photo-processor'; // Adjust the path to your Lambda function

const event = {
  body: 'base64_image_data', // Replace with actual base64-encoded image data for testing
};

handler(event as any)
  .then((response) => {
    console.log('Lambda function response:', response);
  })
  .catch((error) => {
    console.error('Error:', error);
  });
