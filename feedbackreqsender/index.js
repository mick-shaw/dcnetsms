/**
 * xxxFeedBackReqSender.js
 *
 * Author: Mick Shaw
 * Email: voice.eng@dc.gov
 * Date: 05/14/2023
 *
 * This script fetches Medicaid notifications from a DynamoDB table and sends
 * SMS notifications using the Amazon Pinpoint API. The script tracks the
 * status of each message, ensuring each user only receives one notification.
 */

// Load AWS SDK and instantiate DocumentClient and Pinpoint
const AWS = require('aws-sdk');
const docClient = new AWS.DynamoDB.DocumentClient();
const pinpoint = new AWS.Pinpoint();
const aws_region = "us-east-1";

// The main handler function
exports.handler = async (event) => {
  try {
    // Fetch all Medicaid notifications from DynamoDB
    const MedicaidNotifications = await getAllMedicaidNotifications();

    // Iterate over each notification
    for (const notification of MedicaidNotifications) {
      try {
        const { id, CustomerPhone, MedicaidNotificationstatus , LANGUAGE } = notification;
        const destinationNumber = CustomerPhone;

        // The SMS message to be sent
         let message = "Hello. This is an important message from DC Medicaid.  All Medicaid beneficiaries need to update their contact information NOW to receive Medicaid renewal information in the mail. Update your contact information, renew your coverage, or find your renewal deadline, by going to district direct dot dc dot gov. You can access District Direct on your cell phone by downloading it from the Android and iPhone app stores. That’s district direct dot dc dot gov. Need help? Call the DC Public Benefits Call Center at 202.727.5355. Thank you! . Reply STOP to opt out.";

          if (LANGUAGE === 'Spanish') {
              message = "Hola. Este es un mensaje importante de DC Medicaid.  Todos los beneficiarios de Medicaid deben actualizar su información de contacto AHORA para recibir información sobre la renovación de Medicaid por correo. Actualice su información de contacto, renueve su cobertura o vea su fecha límite en district direct punto dc punto gov. Puede acceder a District Direct desde su teléfono celular descargando la aplicación en las tiendas de aplicaciones de Android y iPhone. Es district direct punto dc punto gov. ¿Necesita ayuda? Llame al Centro de llamadas de beneficios públicos del DC al 202.727.5355. ¡Gracias!";
          } else if (LANGUAGE === 'Amharic') {
      message = "ሃሎ፤ ይህ ከዲሲ ሜዴኬይድ (DC Medicaid) የመጣ ጠቃሚ መልዕክት ነው። የሜዲኬይድ ዕድሳትን የሚመለከት መረጃ ለመቀበል ሁሉም የሜዲኬይድ ተጠቃሚዎች የመገኛ መረጃችወን (contact information) አሁኑኑ ማደስ አለባቸው። ወደ district direct dot dc dot gov በመሄድ የመገኛ መረጃዎን (contact information) ያድሱ፤ ሽፋንዎን ያድሱ፤ ወይም የእድሳት ጊዜዎን ያግኙ። ዲስትሪክት ዳይረክትን (District Direct) በስልክዎ ላይ ከ አንድሮይድ (Android) እና አይፎን (iPhone) አፕ ስቶር  (app stores) በማውረድ መጠቀም ይችላሉ። ይህም district direct dot dc dot gov ነው። ዕርዳታ ይሻሉ? ወደ ዲሲ የህዝብ ጥቅሞች የጥሪ ማዕከል (DC Public Benefits Call Center) በ 202.727.5355 ይደውሉ። እናመሰግናለን!";
            }

        // Skip notifications that have already been sent
        if (MedicaidNotificationstatus === 'Sent') {
          console.log('SMS already sent for MEDICAID ID:', id);
          continue;
        }

        // Prepare the parameters for the SMS
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

        // Send the SMS and get the response
        const messageResponse = await sendSMS(smsParams);
        const messageId = messageResponse['MessageResponse']['Result'][destinationNumber]['MessageId'];

        // Update the status of the notification in DynamoDB
        await updateMedicaidNotificationstatus(id, messageId, MedicaidNotificationstatus);  

        // Add a record to the feedbacks table
        await addFeedbackRecord(id, destinationNumber);

        // Add a record to the message-lookup table
        await addMessageLookupRecord(messageId, id);

        console.log("SMS sent and records added successfully for MEDICAID ID:", id);
      } catch (err) {
        console.error(err, err.stack);
        throw new Error("Failed to send SMS and add records for MEDICAID ID:", appointment.id);
      }
    }

    console.log("All MedicaidNotifications processed successfully.");
  } catch (err) {
    console.error(err, err.stack);
    throw new Error("Failed to fetch MedicaidNotifications from the table.");
  }
};

// Function to fetch all Medicaid notifications from DynamoDB
async function getAllMedicaidNotifications() {
  const params = {
    TableName: "MedicaidNotifications",
  };

  const result = await docClient.scan(params).promise();
  return result.Items;
}

// Function to send an SMS using Pinpoint
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

// Function to add a record to the feedbacks table
async function addFeedbackRecord(MEDICAIDID, destinationNumber) {
  // Prepare the parameters for the feedback record
  const params = {
    TableName: "feedbacks",
    ReturnConsumedCapacity: "TOTAL",
    Item: {
      "MEDICAIDID": MEDICAIDID,
      "FeedbackScore": 'Not captured',
      "FeedbackScore2": 'Not captured',
      "FeedbackScore3": 'Not captured',
      "FeedbackScore4": 'Not captured',
      "Timestamp": Math.floor(new Date().getTime() / 1000.0),
      "DestinationNumber": destinationNumber
    }
  };

  // Add the feedback record to DynamoDB
  await docClient.put(params).promise();
}

// Function to add a record to the message-lookup table
async function addMessageLookupRecord(messageId, MEDICAIDID) {
  // Prepare the parameters for the message lookup record
  const params = {
    TableName: "message-lookup",
    ReturnConsumedCapacity: "TOTAL",
    Item: {
      "FeedbackMessageId": messageId,
      "MEDICAIDID": MEDICAIDID,
      "ConversationStage": 1
    }
  };

  // Add the message lookup record to DynamoDB
  await docClient.put(params).promise();
}

// Function to update the status of a Medicaid notification in DynamoDB
async function updateMedicaidNotificationstatus(MEDICAIDID, messageId, currentStatus) {
  // Prepare the parameters for the update
  const params = {
    TableName: "MedicaidNotifications",
    Key: {
      "id": MEDICAIDID
    },
    UpdateExpression: "SET MedicaidNotificationstatus = :status, MessageId = :messageId",
    ExpressionAttributeValues: {
      ":status": "Sent",
      ":messageId": messageId
    }
  };

  // Update the notification status in DynamoDB
  await docClient.update(params).promise();
}

}
