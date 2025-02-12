const os = require('os');
const nodemailer = require('nodemailer');
const axios = require('axios');
require('dotenv').config();

// Get the local IP address dynamically
const getLocalIP = () => {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const config of iface) {
            if (config.family === 'IPv4' && !config.internal) {
                return config.address; // Return the first external IPv4 address
            }
        }
    }
    return 'localhost'; // Default if no external IP is found
};

const SERVER_PORT = process.env.SERVER_PORT || 3000; // Default to port 3000
const BASEURL = `http://${getLocalIP()}:${SERVER_PORT}/eupe`; // Include `/eupe/` extension

const sendInvoiceEmail = async (invoiceID, recipientEmail) => {
    try {
        const pdfURL = `${BASEURL}/download-invoice/${invoiceID}`;

        // 1. Fetch the invoice PDF
        const pdfResponse = await axios.get(pdfURL, {
            responseType: 'arraybuffer' // Ensures we get raw PDF data
        });

        // 2. Set up the email transporter
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // SSL
            auth: {
                user: process.env.EMAIL_USER, // Your Gmail
                pass: process.env.EMAIL_PASS  // 16-character app password
            }
        });

        // 3. Define email options
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: recipientEmail,
            subject: `Invoice #${invoiceID}`,
            text: `Hello,\n\nPlease find attached invoice #${invoiceID}.\n\nThank you.`,
            attachments: [{
                filename: `Invoice-${invoiceID}.pdf`,
                content: pdfResponse.data,
                contentType: 'application/pdf'
            }]
        };

        // 4. Send the email
        await transporter.sendMail(mailOptions);
        console.log(`Invoice ${invoiceID} sent to ${recipientEmail}`);
        return { success: true, message: `Invoice ${invoiceID} sent to ${recipientEmail}` };

    } catch (error) {
        console.error('Error sending invoice:', error);
        throw new Error('Failed to send invoice');
    }
};

module.exports = {
    sendInvoiceEmail
}
