const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { generatePDFHeader } = require("./header.js");

/**
 * Generate a PDF report for customers grouped by collection day.
 * @param {Object} groupedByCollectionDay - Customers grouped by collection day.
 * @param {string} filePath - Path to save the PDF file.
 * @param {string} reportTitle - Title of the report.
 * @returns {Promise<void>}
 */
async function generatePDF(groupedByCollectionDay, filePath, reportTitle) {
  const doc = new PDFDocument({ margin: 50 });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  try {
    // Await the header function
    await generatePDFHeader(doc);

    doc.fontSize(18).text(reportTitle, 100,180).moveDown();

    // Add grouped data to the PDF
    for (const [day, { count, customers, totalClosingBalance, monthlyTotal }] of Object.entries(groupedByCollectionDay)) {
      doc.fontSize(12).text(`Collection Day: ${day} (Total Customers: ${count})`, { underline: true }).moveDown();
      doc.fontSize(10).text('Name', 50, doc.y, { continued: true })
        .text('PhoneNumber', 150, doc.y, { continued: true })
        .text('Balance', 300, doc.y, { continued: true })
        .text('MonthlyCharge', 410, doc.y).moveDown();
      doc.moveTo(50, doc.y - 5).lineTo(550, doc.y - 5).stroke().moveDown();

      customers.forEach((customer) => {
        doc.fontSize(10).fillColor('#333')
          .text(`${customer.firstName} ${customer.lastName}`, 50, doc.y, { continued: true })
          .text(customer.phoneNumber, 150, doc.y, { continued: true })
          .text(customer.closingBalance.toFixed(2), 300, doc.y, { continued: true })
          .text(customer.monthlyCharge.toFixed(2), 410, doc.y).moveDown();
      });

      doc.moveDown().fontSize(12)
        .text(`Total Closing Balance for this Collection Day: ${totalClosingBalance.toFixed(2)}`, 50, doc.y)
        .moveDown()
        .text(`Total Monthly Charges for this Collection Day: ${monthlyTotal.toFixed(2)}`, 50, doc.y)
        .moveDown().moveDown();
    }

    doc.end();

    // Return a promise that resolves when writing is done
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}


/**
 * Helper function to generate and send a PDF report for a specific category.
 * @param {Array} customers - Array of customers in the category.
 * @param {string} title - Title of the report.
 * @param {string} fileName - Name of the PDF file.
 * @param {Object} res - Express response object.
 */
async function generateReport(customers, title, fileName, res) {
  // Group customers by garbage collection day
  const groupedByCollectionDay = customers.reduce((acc, customer) => {
    const day = customer.garbageCollectionDay;
    if (!acc[day]) {
      acc[day] = { count: 0, customers: [], totalClosingBalance: 0, monthlyTotal: 0 };
    }
    acc[day].count += 1;
    acc[day].customers.push(customer);
    acc[day].totalClosingBalance += customer.closingBalance;
    acc[day].monthlyTotal += customer.monthlyCharge;
    return acc;
  }, {});

  // Generate the PDF
  const filePath = path.join(__dirname, '..', 'reports', `${fileName}.pdf`);
  await generatePDF(groupedByCollectionDay, filePath, title);

  // Send the file to the client and delete it afterward
  res.download(filePath, `${fileName}.pdf`, (err) => {
    if (err) {
      console.error('File download error:', err);
      res.status(500).send('Error generating report');
    }
    fs.unlinkSync(filePath); // Clean up the generated file
  });
}

module.exports = {
  generatePDF,
  generateReport,
};
