/**
 * xxxFeedBackReqSender.js
 *
 * Author: Mick Shaw
 * Email: voice.eng@dc.gov
 * Date: 05/14/2023
 * Each time a recipient replies to an SMS, 
 * Amazon Pinpoint publishes the reply event to an Amazon SNS topic
 *  which is subscribed by an Amazon SQS queue. 
 * Amazon Pinpoint will also add a messageId to this event which allows 
 * us to bind it to a sendMessages operation call.

 * This AWS Lambda function polls these reply events from the Amazon SQS queue. 
 * It checks whether the reply is in the correct format (i.e. a number) and 
 * also associated with a previous request. If all conditions are met, 
 * the AWS Lambda function checks the ConversationStage attribute’s value 
 * from the message-lookup table. 
 * According to the current stage and the SMS answer received, 
 * AWS Lambda function will determine the next step.

 **/


const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();
const pinpoint = new AWS.Pinpoint();
const aws_region = "us-east-1";

exports.handler = async (event) => {
  console.log("Lambda triggered with event: " + JSON.stringify(event));
  //Source of this lambda function is the SQS engine.
  if(!event.Records) return "ERROR: Unexpected payload.";
  let hasError=false;
  for (const item of event.Records) {
       try{
         let body=JSON.parse(item.body);
         let messageBody=body.messageBody;
         let messageId=body.previousPublishedMessageId;
         let destinationNumber=body.originationNumber;
         //update the feedbacks table with the feedback number received.
         var feedback = parseInt(messageBody);
         if(!isNaN(feedback)){
         	//determine the conversation stage. If this is the first feedback from the user, stage returns as 1.
            let lookupData=await lookupMEDICAIDIDAndStage(messageId); // if messageid is not known throws an error. 
         	let currentStage=lookupData.ConversationStage;
         	let MEDICAIDID=lookupData.MEDICAIDID;
         	let message;
         	let isConversationFinished=true;
         	if(currentStage==1){
            	//update the feedback score
            	//send thank you sms
	        	message="I'm sorry, but this is not a monitored number.  For additional information please call the DC Public Benefits Call Center at 202.727.5355. Thank you! ";
	            	currentStage=currentStage+1;
	            	isConversationFinished=false;
	           	await updateDynamoDbFeedbackScore1 (MEDICAIDID, feedback);
	                        }
            else if(currentStage==2){
                //update the feedback score
            	//send thank you sms
                message ="I'm sorry, but this is not a monitored number.  For additional information please call the DC Public Benefits Call Center at 202.727.5355. Thank you! ";
                	currentStage=currentStage+1;
	            	isConversationFinished=false;
	           	await updateDynamoDbFeedbackScore2 (MEDICAIDID, feedback);
	            
            }
            else if(currentStage==3){
                //update the feedback score
            	//send thank you sms
	            message ="I'm sorry, but this is not a monitored number.  For additional information please call the DC Public Benefits Call Center at 202.727.5355. Thank you! ";
	            	currentStage=currentStage+1;
	            	isConversationFinished=false;
	           await updateDynamoDbFeedbackScore3 (MEDICAIDID, feedback);
	            
            }
             else if(currentStage==4){
                //send thank you sms
	           await updateDynamoDbFeedbackScore4 (MEDICAIDID, feedback);
	            message ="I'm sorry, but this is not a monitored number.  For additional information please call the DC Public Benefits Call Center at 202.727.5355. Thank you! ";
	            	currentStage=currentStage+1;
	            	isConversationFinished=true;
	           
            }
            else
            	throw ('unknown stage');

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

            let result=await sendSMS(smsParams);
            messageId=result['MessageResponse']['Result'][destinationNumber]['MessageId'];

            if(isConversationFinished==false){
            	//if conversation will continue, add the last messageid and the new stage to the lookup table
            	//add this messageid to message-id order-id lookup table
                    var params = {
                                TableName: "message-lookup",
                                ReturnConsumedCapacity: "TOTAL",
                                Item: {
                                    "FeedbackMessageId": messageId,
                                    "MEDICAIDID": MEDICAIDID,
                                    "ConversationStage": currentStage
                                }
                    };
                    result= await docClient.put(params).promise();
            }
        }//isNAN
       }
       catch(err){
        //sms's which include non-numeric responses or which doesn't have corresponding feedbackmessageids will be ignored.
         console.error(err.name, err.message);
       }
  }//for
  return "OK";
};//eventHandler


async function lookupMEDICAIDIDAndStage(messageId){
	try {
			var params = {
			  TableName : 'message-lookup',
			  Key: {
			    FeedbackMessageId: messageId
			  }
			};
	    	const data = await docClient.get(params).promise();
	    	return data.Item;
	} catch (err) {
	    console.log("Failure", err.message)
	    throw err;
	}
}

async function updateDynamoDbFeedbackScore1 (MEDICAIDID, feedbackScore){
	  const strAppintmentId=MEDICAIDID.toString();
	  let params = {
	      TableName:'feedbacks',
	      Key:{
	          "MEDICAIDID": strAppintmentId
	      },
	      UpdateExpression: "set FeedbackScore = :val1",
	      ConditionExpression: "attribute_exists(MEDICAIDID)",
	      ExpressionAttributeValues:{
	          ":val1":feedbackScore
	      },
	      ReturnValues:"UPDATED_NEW"
	  };
	  try {
		    const data = await docClient.update(params).promise();
		    return data;
	 } catch (err) {
		    console.log("Failure", err.message)
		    throw err;
	 }
}


async function updateDynamoDbFeedbackScore2 (MEDICAIDID, feedbackScore){
	  const strMEDICAIDID=MEDICAIDID.toString();
	  let params = {
	      TableName:'feedbacks',
	      Key:{
	          "MEDICAIDID": strMEDICAIDID
	      },
	      UpdateExpression: "set FeedbackScore2 = :val1",
	      ConditionExpression: "attribute_exists(MEDICAIDID)",
	      ExpressionAttributeValues:{
	          ":val1":feedbackScore
	      },
	      ReturnValues:"UPDATED_NEW"
	  };
	  try {
		    const data = await docClient.update(params).promise();
		    return data;
	 } catch (err) {
		    console.log("Failure", err.message)
		    throw err;
	 }
}
async function updateDynamoDbFeedbackScore3 (MEDICAIDID, feedbackScore){
	  const strMEDICAIDID=MEDICAIDID.toString();
	  let params = {
	      TableName:'feedbacks',
	      Key:{
	           "MEDICAIDID": strMEDICAIDID
	      },
	      UpdateExpression: "set FeedbackScore3 = :val1",
	      ConditionExpression: "attribute_exists(MEDICAIDID)",
	      ExpressionAttributeValues:{
	          ":val1":feedbackScore
	      },
	      ReturnValues:"UPDATED_NEW"
	  };
	  try {
		    const data = await docClient.update(params).promise();
		    return data;
	 } catch (err) {
		    console.log("Failure", err.message)
		    throw err;
	 }
}

async function updateDynamoDbFeedbackScore4 (MEDICAIDID, feedbackScore){
	  const strMEDICAIDID=MEDICAIDID.toString();
	  let params = {
	      TableName:'feedbacks',
	      Key:{
	          "MEDICAIDID": strMEDICAIDID
	      },
	      UpdateExpression: "set FeedbackScore4 = :val1",
	      ConditionExpression: "attribute_exists(MEDICAIDID)",
	      ExpressionAttributeValues:{
	          ":val1":feedbackScore
	      },
	      ReturnValues:"UPDATED_NEW"
	  };
	  try {
		    const data = await docClient.update(params).promise();
		    return data;
	 } catch (err) {
		    console.log("Failure", err.message)
		    throw err;
	 }
}
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
