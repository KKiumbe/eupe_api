const express = require('express');
const { sendInvoiceEmail } = require('../../controller/mailer/mailer.js');
const router = express.Router();

router.post('/email-invoice', async (req, res) => {
    try {
        const { invoiceID, recipientEmail } = req.body;

        if (!invoiceID || !recipientEmail) {
            return res.status(400).json({ error: 'Missing invoice ID or recipient email' });
        }

        const result = await sendInvoiceEmail(invoiceID, recipientEmail);
        res.json(result);

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
