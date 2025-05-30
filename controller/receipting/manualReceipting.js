const { PrismaClient } = require('@prisma/client');
const { sendSMS } = require('../sms/smsController');

const prisma = new PrismaClient();

const paybill = process.env.PAYBILL;
const customerSupport =  process.env.CUSTOMER_SUPPORT;

function generateReceiptNumber() {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `RCPT${randomDigits}`;
}

function generateTransactionId() {
    const randomDigits = Math.floor(10000 + Math.random() * 90000);
    return `C${randomDigits}`; // Prefix with "C"
}

const manualCashPayment = async (req, res) => {
    const { customerId, totalAmount, modeOfPayment, paidBy, paymentId } = req.body;

    if (!customerId || !totalAmount || !modeOfPayment || !paidBy) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            select: { phoneNumber: true, firstName: true, closingBalance: true },
        });

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found.' });
        }

        const transactionId = generateTransactionId();
        let remainingAmount = totalAmount;
        const receipts = [];

        // Update or create payment record
        let updatedPayment;
        if (paymentId) {
            updatedPayment = await prisma.payment.update({
                where: { id: paymentId },
                data: {
                    amount: totalAmount,
                    modeOfPayment,
                    transactionId: transactionId,
                    receipted: true,
                    createdAt: new Date(),
                },
            });
        } else {
            updatedPayment = await prisma.payment.create({
                data: {
                    amount: totalAmount,
                    modeOfPayment,
                    transactionId: transactionId,
                    receipted: true,
                    createdAt: new Date(),
                },
            });
        }

        // Fetch unpaid or partially paid invoices
        const invoices = await prisma.invoice.findMany({
            where: { customerId, status: { in: ['UNPAID', 'PPAID'] } },
            orderBy: { createdAt: 'asc' }, // Oldest invoices first
        });

        let totalPaidToInvoices = 0;

        if (invoices.length === 0) {
            // SCENARIO: No unpaid or partially paid invoices
            const newClosingBalance = customer.closingBalance - totalAmount;

            // Update customer's closing balance
            await prisma.customer.update({
                where: { id: customerId },
                data: { closingBalance: newClosingBalance },
            });

            receipts.push({
                invoiceId: null,
            });

            const balanceMessage = newClosingBalance < 0
                ? `an overpayment of KES ${Math.abs(newClosingBalance)}`
                : `KES ${newClosingBalance}`;

            const message = `Dear ${customer.firstName}, payment of KES ${totalAmount} received successfully. ` +
                `Your balance is ${balanceMessage}. Help us serve you better by paying via Paybill No:${paybill}, your phone number is the account number.Inquiries?Call :${customerSupport} .`;

                const mobile = customer.phoneNumber;

            await sendSMS(mobile, message);

            return res.status(201).json({
                message: 'Payment applied to closing balance successfully. SMS notification sent.',
                receipt: receipts,
                newClosingBalance,
            });
        }

        // Process invoices if they exist
        for (const invoice of invoices) {
            if (remainingAmount <= 0) break;

            const invoiceDueAmount = invoice.invoiceAmount - invoice.amountPaid;
            const paymentForInvoice = Math.min(remainingAmount, invoiceDueAmount);

            const updatedInvoice = await prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                    amountPaid: invoice.amountPaid + paymentForInvoice,
                    status: invoice.amountPaid + paymentForInvoice >= invoice.invoiceAmount ? 'PAID' : 'PPAID',
                },
            });

            receipts.push({ invoiceId: updatedInvoice.id });
            totalPaidToInvoices += paymentForInvoice;
            remainingAmount -= paymentForInvoice;
        }

        // Apply remaining payment to closing balance or record overpayment
        const newClosingBalance = customer.closingBalance - totalAmount;

        // Update customer's closing balance
        await prisma.customer.update({
            where: { id: customerId },
            data: { closingBalance: newClosingBalance },
        });

        receipts.push({
            invoiceId: null, // Adjustment to closing balance or overpayment
            description: `Applied KES ${remainingAmount} to ${newClosingBalance < 0 ? 'overpayment' : 'closing balance'}`,
        });

        remainingAmount = 0;

        // Create receipt
        const receiptNumber = generateReceiptNumber();
        const receipt = await prisma.receipt.create({
            data: {
                customerId,
                amount: totalAmount,
                modeOfPayment,
                receiptNumber,
                paymentId: updatedPayment.id,
                paidBy,
                createdAt: new Date(),
            },
        });

        // SMS Notification
        const balanceMessage = newClosingBalance < 0
            ? `an overpayment of KES ${Math.abs(newClosingBalance)}`
            : `KES ${newClosingBalance}`;
        const message = `Dear ${customer.firstName}, payment of KES ${totalAmount} received successfully. ` +
            `Your balance is ${balanceMessage}. Help us serve you better by always paying via Paybill No:${paybill},your phone number as the account number. Customer support: ${customerSupport}.`;
            const mobile = customer.phoneNumber;

            await sendSMS(mobile, message);


        // Respond with success
        res.status(201).json({
            message: 'Payment and receipt created successfully, SMS notification sent.',
            receipt,
            updatedPayment,
            updatedInvoices: invoices,
            newClosingBalance,
        });
    } catch (error) {
        console.error('Error creating manual cash payment:', error);
        res.status(500).json({ error: 'Failed to create manual cash payment.', details: error.message });
    }
};

// Helper function to format phone number
function sanitizePhoneNumber(phone) {
    if (typeof phone !== 'string') {
        console.error('Invalid phone number format:', phone);
        return '';
    }

    if (phone.startsWith('+254')) {
        return phone.slice(1);
    } else if (phone.startsWith('0')) {
        return `254${phone.slice(1)}`;
    } else if (phone.startsWith('254')) {
        return phone;
    } else {
        return `254${phone}`;
    }
}

module.exports = { manualCashPayment };
