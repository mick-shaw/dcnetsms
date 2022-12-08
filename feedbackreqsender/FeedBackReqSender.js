//xxxFeedBackReqSender.js
//
// Created by: Mick Shaw
// Contact Information: voice.eng@dc.gov
// Date: 12/07/2022
// Subject: xxxxDFeedReqSender.js
//
// --------------------------------
// The flow of events starts when a Amazon DynamoDB table item, 
// representing an online appointment, changes its status to COMPLETED. 
// An AWS Lambda function which is subscribed to these changes over DynamoDB Streams 
// detects this change and sends an SMS to the customer by using 
// Amazon Pinpoint API’s sendMessages operation.

// Amazon Pinpoint delivers the SMS to the recipient and generates a unique message ID
// to the AWS Lambda function. The Lambda function then adds this message ID 
// to a DynamoDB table called “message-lookup”. This table is used for tracking 
// different feedback requests sent during a multi-step conversation and 
// associate them with the appointment ids. At this stage, the 
// Lambda function also populates another table “feedbacks” which will hold the 
// feedback responses that will be sent as SMS reply messages.
//  
//
// --------------------------------    

const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const pinpoint = new AWS.Pinpoint();
const aws_region = "us-east-1";


exports.handler = async (event) => {
    for (const record of event.Records){
        console.log('Stream record: ', JSON.stringify(record, null, 2));
        if (record.eventName == 'MODIFY') {
        	//check if the status is COMPLETED
        	if(record.dynamodb && record.dynamodb.NewImage.AppointmentStatus.S=='COMPLETED'){
        		//send SMS and add record to the feedbacks table.
        		var destinationNumber=record.dynamodb.NewImage.CustomerPhone.S;
        		var appointmentId=record.dynamodb.NewImage.id.S;
        		console.log(destinationNumber);
                try {
                    //send SMS to the destination number
                    var message = "DC Medicaid is seeking to verify services you received from a Medicaid provider. Please enter 1 for yes or 2 for no if you receive services from DCNET"
                    + " Reply STOP to opt out.";
                    var smsParams = {
                      ApplicationId: process.env.APPLICATION_ID,
                      MessageRequest: {
                        Addresses: {
                          [destinationNumber]: {
                            ChannelType: 'SMS'
                          }
                        },
                        MessageConfiguration: {
                          SMSMessage: {
                            Body: message,
                            MessageType: 'TRANSACTIONAL'
                          }
                        }
                      }
                    };
                    let data = await sendSMS(smsParams);
                    let messageId=data['MessageResponse']['Result'][destinationNumber]['MessageId'];

                    //populate the feedbacks table for this order.
                    var params = {
                                TableName: "feedbacks",
                                ReturnConsumedCapacity: "TOTAL",
                                Item: {
                                    "AppointmentId": appointmentId,
                                    "FeedbackScore": 'Not captured',
                                    "FeedbackScore2": 'Not captured',
                                    "FeedbackScore3": 'Not captured',
                                    "FeedbackScore4": 'Not captured',
                                    "Timestamp": Math.floor(new Date().getTime() / 1000.0),
                                    "DestinationNumber": destinationNumber
                                }
                    };
                    let result= await docClient.put(params).promise();

                    //add this messageid to the lookup table
                    var params = {
                                TableName: "message-lookup",
                                ReturnConsumedCapacity: "TOTAL",
                                Item: {
                                    "FeedbackMessageId": messageId,
                                    "AppointmentId": appointmentId,
                                    "ConversationStage": 1
                                }
                    };
                    result= await docClient.put(params).promise();
                    console.log(result);
                } catch (err) {
                    console.error(err, err.stack);
                    //return err;
                }
        	}//appointment status is completed
        }
    }
};

async function sendSMS (params) {
    return new Promise ((resolve,reject) => {
        pinpoint.sendMessages(params, function(err, data) {
                      // If something goes wrong, print an error message.
                      if(err) {
                        console.log(err.message);
                        reject(err);
                      // Otherwise, show the unique ID for the message.
                      } else {
                        resolve(data);
                      }
        });
 
    });
}

