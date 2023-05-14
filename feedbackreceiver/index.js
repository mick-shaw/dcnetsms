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
  try {
    const appointments = await getAllAppointments();
    for (const appointment of appointments) {
      try {
        const { id, CustomerPhone, AppointmentStatus } = appointment;
        const destinationNumber = CustomerPhone;
        const message = "This message is from DC Medicaid. It’s time to renew your Medicaid coverage! Don’t wait to update your contact information! Click here to go to districtdirect.dc.gov to update your info, and then check your mail for important information, including your renewal deadline. Reply STOP to opt out.";
         // Check if SMS has already been sent for the appointment
        if (AppointmentStatus === 'Sent') {
          console.log('SMS already sent for appointment ID:', id);
          continue; // Skip to the next appointment
        }
        
        const smsParams = {
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

        const messageResponse = await sendSMS(smsParams);
        const messageId = messageResponse['MessageResponse']['Result'][destinationNumber]['MessageId'];
        
        await updateAppointmentStatus(id, messageId, AppointmentStatus);  
        
        await addFeedbackRecord(id, destinationNumber);
        await addMessageLookupRecord(messageId, id);

        console.log("SMS sent and records added successfully for appointment ID:", id);
      } catch (err) {
        console.error(err, err.stack);
        throw new Error("Failed to send SMS and add records for appointment ID:", appointment.id);
      }
    }

    console.log("All appointments processed successfully.");
  } catch (err) {
    console.error(err, err.stack);
    throw new Error("Failed to fetch appointments from the table.");
  }
};

async function getAllAppointments() {
  const params = {
    TableName: "appointments",
  };

  const result = await docClient.scan(params).promise();
  return result.Items;
}

async function sendSMS(params) {
  return new Promise((resolve, reject) => {
    pinpoint.sendMessages(params, function(err, data) {
      if (err) {
        console.error(err.message);
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

async function addFeedbackRecord(appointmentId, destinationNumber) {
  const params = {
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

  await docClient.put(params).promise();
}

async function addMessageLookupRecord(messageId, appointmentId) {
  const params = {
    TableName: "message-lookup",
    ReturnConsumedCapacity: "TOTAL",
    Item: {
      "FeedbackMessageId": messageId,
      "AppointmentId": appointmentId,
      "ConversationStage": 1
    }
  };

  await docClient.put(params).promise();
}

async function updateAppointmentStatus(appointmentId, messageId, currentStatus) {
  const params = {
    TableName: "appointments",
    Key: {
      "id": appointmentId
    },
    UpdateExpression: "SET AppointmentStatus = :status, MessageId = :messageId",
    ExpressionAttributeValues: {
      ":status": "Sent",
      ":messageId": messageId
    }
  };

  await docClient.update(params).promise();
}
