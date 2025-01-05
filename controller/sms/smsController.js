const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const prisma = new PrismaClient();

const SMS_API_KEY = process.env.SMS_API_KEY;
const PARTNER_ID = process.env.PARTNER_ID;
const SHORTCODE = process.env.SHORTCODE;
const SMS_ENDPOINT = process.env.SMS_ENDPOINT;
const BULK_SMS_ENDPOINT = process.env.BULK_SMS_ENDPOINT;
const SMS_BALANCE_URL = process.env.SMS_BALANCE_URL;

const paybill = process.env.PAYBILL;
const customerSupport =  process.env.CUSTOMER_SUPPORT;

const checkSmsBalance = async () => {
  try {
    const response = await axios.post(SMS_BALANCE_URL, {
      apikey: SMS_API_KEY,
      partnerID: PARTNER_ID,
    });
    return response.data.balance;
  } catch (error) {
    console.error('Error fetching SMS balance:', error);
    throw new Error('Failed to retrieve SMS balance');
  }
};

const sanitizePhoneNumber = (phone) => {
  if (typeof phone !== 'string') return '';
  if (phone.startsWith('+254')) return phone.slice(1);
  if (phone.startsWith('0')) return `254${phone.slice(1)}`;
  if (phone.startsWith('254')) return phone;
  return `254${phone}`;
};





const sendToOne = async (req, res) => {
  const { mobile, message } = req.body;
  try {
      const response = await sendSMS(mobile, message);
      res.status(200).json({ success: true, response });
  } catch (error) {
      console.error('Error in sendToOne:', error.message);
      res.status(500).json({ success: false, message: error.message });
  }
};

const sendSMS = async (mobile, message) => {

  console.log(`this is ${mobile}`);
  let clientsmsid;

  try {
      // Check SMS balance
      const balance = await checkSmsBalance();
      if (balance < 1) {
          throw new Error('Insufficient SMS balance');
      }

      // Sanitize phone number
      

      // Fetch the customer ID from the database
      const customer = await prisma.customer.findUnique({
          where: { phoneNumber: mobile },
      });

      if (!customer) {
          console.error(`No customer found for phone number: ${mobile}`);
          throw new Error('Customer not found. Please ensure the phone number is correct.');
      }

      const customerId = customer.id;

      // Generate unique clientsmsid
      clientsmsid = uuidv4();

      console.log(`Creating SMS record with clientsmsid: ${clientsmsid} for customerId: ${customerId}`);

      // Create SMS record in the database
      const smsRecord = await prisma.sMS.create({
          data: {
              clientsmsid,
              customerId,
              mobile,
              message,
              status: 'pending',
          },
      });

      console.log(`SMS record created: ${JSON.stringify(smsRecord)}`);

      // Prepare SMS payload
      const payload = {
          partnerID: PARTNER_ID,
          apikey: SMS_API_KEY,
          message,
          shortcode: SHORTCODE,
          mobile,
      };

      console.log(`Sending SMS with payload: ${JSON.stringify(payload)}`);

      // Send SMS
      const response = await axios.post(SMS_ENDPOINT, payload);

      console.log('SMS sent successfully. Updating status to "sent".');

      // Update SMS record to "sent"
      await prisma.sMS.update({
          where: { id: smsRecord.id },
          data: { status: 'sent' },
      });

      return response.data;
  } catch (error) {
      console.error('Error sending SMS:', {
          message: error.message,
          stack: error.stack,
          mobile,
      });

      // Handle failed SMS
      if (clientsmsid) {
          try {
              await prisma.sMS.update({
                  where: { clientsmsid },
                  data: { status: 'failed' },
              });
              console.log(`SMS status updated to "failed" for clientsmsid: ${clientsmsid}`);
          } catch (updateError) {
              console.error('Error updating SMS status to "failed":', updateError.message);
          }
      }

      throw new Error(error.response ? error.response.data : 'Failed to send SMS.');
  }
};


// Send bills to all active customers
const sendBills = async (req, res) => {
  try {
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE' },
    });

    const messages = activeCustomers.map((customer) => {
      const message = `Dear ${customer.firstName},your current balance is KES ${customer.closingBalance}. Your current Month bill is ${customer.monthlyCharge}.Use paybill No:${paybill};your phone number,is the account number.Inquiries? call:${customerSupport}.Thank you for being a loyal customer.`;
      return { phoneNumber: customer.phoneNumber, message };
    });

    const smsResponses = await sendSms(messages);

    res.status(200).json({ message: 'Bills sent successfully', smsResponses });
  } catch (error) {
    console.error('Error sending bills:', error);
    res.status(500).json({ error: 'Failed to send bills.' });
  }
};

// Send SMS to all active customers
const sendToAll = async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    const activeCustomers = await prisma.customer.findMany({
      where: { status: 'ACTIVE' },
    });

    const messages = activeCustomers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message,
    }));

    const smsResponses = await sendSms(messages);

    res.status(200).json({ message: 'SMS sent to all active customers.', smsResponses });
  } catch (error) {
    console.error('Error sending SMS to all customers:', error);
    res.status(500).json({ error: 'Failed to send SMS to all customers.' });
  }
};

// Send bill SMS for a specific customer
const sendBill = async (req, res) => {
  const { customerId } = req.body;

  if (!customerId) {
    return res.status(400).json({ error: 'Customer ID is required.' });
  }

  try {
    // Fetch the customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    // Prepare the message
    const message = `Dear ${customer.firstName}, your current balance is KES ${customer.closingBalance}. Your current Month bill is ${customer.monthlyCharge}.Use paybill No :${paybill} ;your phone number is the account number.Inquiries? call: ${customerSupport}.Thank you for being a loyal customer.`;
    // Call sendSms with an array
    const smsResponses = await sendSms([
      { phoneNumber: customer.phoneNumber, message },
    ]);

    res.status(200).json({ message: 'Bill sent successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill:', error);
    res.status(500).json({ error: 'Failed to send bill.', details: error.message });
  }
};


// Send bill SMS for customers grouped by collection day
const sendBillPerDay = async (req, res) => {
  const { day } = req.body;

  if (!day) {
    return res.status(400).json({ error: 'Day is required.' });
  }

  try {
    const customers = await prisma.customer.findMany({
      where: { garbageCollectionDay: day.toUpperCase() },
    });

    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,

     message : `Dear ${customer.firstName}, your current balance is KES ${customer.closingBalance}. Your current Month bill is ${customer.monthlyCharge}.Use paybill No :${paybill} ;your phone number is the account number.Inquiries? call: ${customerSupport}.Thank you for being a loyal customer.`


      ,
    }));

    const smsResponses = await sendSms(messages);

    res.status(200).json({ message: 'Bills sent for the day successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill per day:', error);
    res.status(500).json({ error: 'Failed to send bill per day.' });
  }
};




const billReminderPerDay = async (req, res) => {
  const { day } = req.body;

  if (!day) {
    return res.status(400).json({ error: 'Day is required.' });
  }

  try {
    // Fetch active customers with a closingBalance less than monthlyCharge for the specified day
    const customers = await prisma.customer.findMany({
      where: {
        garbageCollectionDay: day.toUpperCase(),
        status: 'ACTIVE', // Ensure customer is active
        closingBalance: { lt: prisma.customer.monthlyCharge }, // Check if closingBalance is less than monthlyCharge
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers to notify for the given day.' });
    }

    // Prepare SMS messages
    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message: `Dear ${customer.firstName}, your garbage collection is scheduled today. Please pay immediately to avoid service disruption. Use Paybill ${paybill}, and your phone number as the account number. Inquiries? Call ${customerSupport}.`,


    }));

    // Send SMS using the sendSms service
    const smsResponses = await sendSms(messages);

    // Respond with success message
    res.status(200).json({ message: 'Bill reminders sent for the day successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill reminder per day:', error);
    res.status(500).json({ error: 'Failed to send bill reminders per day.' });
  }
};


const billReminderForAll = async (req, res) => {
  try {
    // Fetch all active customers with a closingBalance less than monthlyCharge
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE', // Ensure customer is active
        closingBalance: { lt: prisma.customer.monthlyCharge }, // Check if closingBalance is less than monthlyCharge
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers to notify.' });
    }

    // Prepare SMS messages
    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message: `Dear ${customer.firstName},you have a pending balance of $${customer.closingBalance},Help us server you better by settling your bill.Pay via ${paybill}, your phone is the the account number `,
    }));

    // Send SMS using the sendSms service
    const smsResponses = await sendSms(messages);

    // Respond with success message
    res.status(200).json({ message: 'Bill reminders sent to all customers successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending bill reminders for all customers:', error);
    res.status(500).json({ error: 'Failed to send bill reminders for all customers.' });
  }
};



const harshBillReminder = async (req, res) => {
  try {
    // Fetch active customers with a closingBalance greater than 2x their monthlyCharge
    const customers = await prisma.customer.findMany({
      where: {
        status: 'ACTIVE', // Only active customers
        closingBalance: { gt: { multiply: prisma.customer.monthlyCharge, factor: 2 } }, // Closing balance > 2x monthly charge
      },
    });

    if (customers.length === 0) {
      return res.status(200).json({ message: 'No customers with significant overdue balances.' });
    }

    // Prepare harsher SMS messages
    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message: `Dear ${customer.firstName}, Please settle your pending bill of ${customer.closingBalance}. Immediate action is required to avoid service disruption. Pay via ${paybill}, your phone is the the account number`,
    }));

    // Send SMS using the sendSms service
    const smsResponses = await sendSms(messages);

    // Respond with success message
    res.status(200).json({ message: 'Harsh bill reminders sent to customers with high balances.', smsResponses });
  } catch (error) {
    console.error('Error sending harsh bill reminders:', error);
    res.status(500).json({ error: 'Failed to send harsh bill reminders.' });
  }
};




// Send SMS to a group of customers
const sendToGroup = async (req, res) => {
  const { day, message } = req.body;

  if (!day || !message) {
    return res.status(400).json({ error: 'Day and message are required.' });
  }

  try {
    const customers = await prisma.customer.findMany({
      where: { garbageCollectionDay: day.toUpperCase() },
    });

    const messages = customers.map((customer) => ({
      phoneNumber: customer.phoneNumber,
      message,
    }));

    const smsResponses = await sendSms(messages);

    res.status(200).json({ message: 'SMS sent to the group successfully.', smsResponses });
  } catch (error) {
    console.error('Error sending SMS to group:', error);
    res.status(500).json({ error: 'Failed to send SMS to group.' });
  }
};

// Helper function to send SMS
const sendSms = async (messages) => {
  const smsList = messages.map((msg) => ({
    partnerID: PARTNER_ID,
    apikey: SMS_API_KEY,
    pass_type: 'plain',
    clientsmsid: uuidv4(),
    message: msg.message,
    shortcode: SHORTCODE,
    mobile: sanitizePhoneNumber(msg.phoneNumber),
  }));

  const response = await axios.post(BULK_SMS_ENDPOINT, {
    count: smsList.length,
    smslist: smsList,
  });

  return response.data;
};

module.exports = {
  sendBills,
  sendToAll,
  sendBill,
  sendBillPerDay,
  sendToGroup,
  sendSMS,
  sendToOne,
  billReminderPerDay,
  billReminderForAll,
  harshBillReminder
};
