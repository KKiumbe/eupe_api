const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { generatePDFHeader } = require('./header.js');
require('dotenv').config();


const prisma = new PrismaClient();

async function generateInvoicePDF(invoiceId) {

  const tagline = process.env.TAGLINE;
  const paymentDetails = process.env.PAYMENTDETAILS;
  try {
    // Fetch invoice and related data from the database
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        items: true,
      },
    });

    if (!invoice) throw new Error('Invoice not found');

    // Calculate balances
    const closingBalance = invoice.customer.closingBalance; // directly from customer
    const invoiceAmount = invoice.invoiceAmount; // invoice amount from the invoice
    const openingBalance = closingBalance - invoiceAmount; // opening balance calculation

    const doc = new PDFDocument({ margin: 50 });
    const pdfPath = path.join(__dirname, 'invoices', `invoice-${invoiceId}.pdf`);

    // Ensure the invoices directory exists
    if (!fs.existsSync(path.dirname(pdfPath))) {
      fs.mkdirSync(path.dirname(pdfPath));
    }

    // Pipe the PDF to a writable stream
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // Company Details with Logo
    await generatePDFHeader(doc);

      
    // Divider line
    //doc.moveTo(50, 150).lineTo(550, 150).stroke();


 

    // Title for the invoice
    doc.fontSize(18)
    .font('NimbusSans-Bold') // Use the bold font
    .fillColor('black')
    .text('Invoice', 230,190,);

// Draw underline manually
doc.moveTo(230, 210)  // Start position (X, Y)
   .lineTo(290, 210)  // End position (X, Y)
   .stroke();

    // Format the invoice period
    const invoiceDate = new Date(invoice.invoicePeriod);
    const options = { month: 'long', year: 'numeric' };
    const formattedPeriod = invoiceDate.toLocaleDateString('en-US', options);


const text = "Invoice to:";
const x = 48;
const y = 240;
const textWidth = doc.widthOfString(text) + 25; // Add padding
const textHeight = doc.currentLineHeight() + 22; // Add padding

    // Invoice Details
    doc.fontSize(12)
      .fillColor('black') 
      .text(`Period: ${formattedPeriod}`,50,220 )
      .text(`Date: ${invoice.invoicePeriod.toDateString()}`, 400,220)
      .text(`Invoice Number: ${invoice.invoiceNumber.slice(0, 8)}`, 400,235)


      .text(`Invoice to:`,50,240 )
     
      .moveDown()

      doc.rect(x, y, textWidth, textHeight).stroke()



      .text(`${invoice.customer.firstName} ${invoice.customer.lastName}`, { align: 'left' })
      .moveDown();

    // Format the opening balance and closing balance
    const formattedOpeningBalance = openingBalance < 0
      ? `Overpayment: KSH${Math.abs(openingBalance).toFixed(2)}`
      : `Previous Arrears (Opening Balance): KSH${openingBalance.toFixed(2)}`;
    const formattedClosingBalance = closingBalance < 0
      ? `Overpayment: KSH${Math.abs(closingBalance).toFixed(2)}`
      : `Closing Balance: KSH${closingBalance.toFixed(2)}`;

    // Add opening balance
    doc.text(formattedOpeningBalance, { align: 'left' })
    .moveDown()
    .moveDown();

    let startY = doc.y;
    doc.font('Helvetica-Bold'); // Make headers bold
    doc.text('Description', 50, startY, { width: 150 });
    doc.text('Quantity', 250, startY, { width: 70, align: 'right' });
    doc.text('Amount', 450, startY, { width: 70, align: 'right' });
    
    // Add horizontal line below headers
    doc.moveTo(50, startY + 15).lineTo(550, startY + 15).stroke();
    
    // Move Y position down for items
    doc.moveDown();
    
    // Reset font to normal
    doc.font('Helvetica');
    
    // Add each invoice item
    invoice.items.forEach(item => {
      let itemY = doc.y;
      doc.text(item.description, 50, itemY, { width: 150 });
      doc.text(item.quantity.toString(), 250, itemY, { width: 70, align: 'right' });
      doc.text(`KSH ${item.amount.toFixed(2)}`, 450, itemY, { width: 70, align: 'right' });
    
      doc.moveDown();
    });

    // Calculate and add the total amount
    const totalAmount = invoice.items.reduce((total, item) => total + item.amount * item.quantity, 0);
    doc.moveDown();
    doc.fontSize(12).text(`Total: KSH${totalAmount.toFixed(2)}`, 50, doc.y, { width: 150 });

    // Add the closing balance at the end in bold
    doc.moveDown();
    doc.fontSize(12).font('Helvetica-Bold').text(formattedClosingBalance, { align: 'left' });



    doc.fontSize(12)
    .fillColor('green') 

    .text(`${paymentDetails}`,50,550,{align: 'center' } )


    // Finalize PDF
    doc.end();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    throw error;
  }
}

// Function to generate and download the invoice
async function downloadInvoice(req, res) {
  const { invoiceId } = req.params;

  try {
    // Generate the PDF file for the given invoice ID
    await generateInvoicePDF(invoiceId);

    // Define the path where the PDF is stored
    const pdfPath = path.join(__dirname, 'invoices', `invoice-${invoiceId}.pdf`);

    // Send the PDF as a download
    res.download(pdfPath, `invoice-${invoiceId}.pdf`, (err) => {
      if (err) {
        console.error('Error downloading invoice:', err);
        res.status(500).send('Error downloading invoice');
      }

      // Optionally delete the file after download
      fs.unlinkSync(pdfPath);
    });
  } catch (error) {
    console.error('Error generating or downloading invoice:', error);
    res.status(500).json({ message: 'Error generating or downloading invoice' });
  }
}

module.exports = { generateInvoicePDF, downloadInvoice };
