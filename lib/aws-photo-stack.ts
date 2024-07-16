import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export class AwsPhotoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create an S3 bucket
    const bucket = new s3.Bucket(this, 'PhotoIdBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Only for demonstration purposes
    });

    const topic = new sns.Topic(this, 'ImageProcessingTopic', {
      displayName: 'Image Processing Notifications',
    });

    topic.addSubscription(
      new subscriptions.EmailSubscription(process.env.MY_EMAIL || '')
    );

    // Define Lambda function
    const processPhotoLambda = new NodejsFunction(this, 'ProcessPhotoLambda', {
      entry: 'lambda/photo-processor.ts', // Entry point to your Lambda function
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        SNS_TOPIC_ARN: topic.topicArn, // Use the SNS topic ARN from environment variables
      },
    });

    // Grant Lambda permissions to read from and write to S3 bucket
    bucket.grantReadWrite(processPhotoLambda);

    // Grant Lambda permissions to publish to the SNS topic
    topic.grantPublish(processPhotoLambda);

    processPhotoLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['rekognition:DetectLabels'],
        resources: ['*'], // You can restrict this to specific resources if needed
      })
    );

    // Define API Gateway
    const api = new apigateway.RestApi(this, 'PhotoIdApi', {
      restApiName: 'My API Service',
    });

    // Define Lambda integration with API Gateway
    const lambdaIntegration = new apigateway.LambdaIntegration(
      processPhotoLambda
    );
    const apiResource = api.root.addResource('processphoto');
    apiResource.addMethod('POST', lambdaIntegration); // POST method to trigger Lambda

    // Output API endpoint URL
    new cdk.CfnOutput(this, 'PhotoIdApiEndpoint', {
      value: api.url,
    });

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(processPhotoLambda)
    );
  }
}

// Bootstrap the CDK application
const app = new cdk.App();
new AwsPhotoStack(app, 'AwsPhotoStack');
