const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

async function generatePDFHeader(doc) {
  const name = process.env.ORGNAME;
  const street = process.env.STREET;
  const phoneNumber = process.env.PHONENUMBER1;
  const phoneNumber2 = process.env.PHONENUMBER2;
  const email = process.env.EMAIL;
  const county = process.env.COUNTY;
  const town = process.env.TOWN;
  const address = process.env.ADDRESS;
  const building = process.env.BUILDING;
  const floor = process.env.FLOOR;
  const tagline = process.env.TAGLINE;

  // Register the Algerian Mesa Regular font
  const algerianFontPath = path.join(__dirname, '..', 'fonts', 'AlgerianMesaRegular.ttf');
  const nimbusFontPath = path.join(__dirname, '..', 'fonts', 'NimbusSanL-Reg.otf');
  const nimbusItalicFontPath = path.join(__dirname, '..', 'fonts', 'nimbus-sans-black-italic.otf');

  const boldFontPath = path.join(__dirname, '..', 'fonts', 'NimbusSanL Bold.ttf');

doc.registerFont('NimbusSans-Bold', boldFontPath);

  doc.registerFont('AlgerianMesa', algerianFontPath);  // For organization name
  doc.registerFont('NimbusSans', nimbusFontPath);      // For other header details
  doc.registerFont('NimbusSansItalic',nimbusItalicFontPath);


  // Construct the logo file path
  const logoPath = path.join(__dirname, '..', 'assets', 'eupe.jpeg'); 

  // Add logo if it exists
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 20, 30, { width: 150 });
  } else {
    console.warn('⚠️ Logo file not found:', logoPath);
  }




  // Use the custom font for the name
  doc.fontSize(20)
    .font('AlgerianMesa')  
    .fillColor('green') 
    .text(name, { align: 'center' })
    .moveDown()
    .moveDown()
    .moveDown();

  // Set font for other details (still green)
  doc.fontSize(11)
  .font('NimbusSans')
    .font('Helvetica')
    .fillColor('green') 
   
    .text(`${building}`, 160, 85)
    .text(`${floor}`, 160, 100)
    .text(`${address}`, 160, 115)
    .text(`Nairobi,Kenya`, 160, 130)
    .text(`Cell:${phoneNumber}`, 390, 85)
    .text(`${phoneNumber2}`, 417, 100)
    .text(`Email:${email}`, 370, 115)

    
   
    .moveDown();


    doc.fontSize(12)
    .font('NimbusSansItalic')
    .fillColor('green') 
    .text(tagline, 230,155)
    .moveDown()
    .moveDown()
    .moveDown();

  // Divider line (also green)
  doc.lineWidth(2).moveTo(50, 170).lineTo(550, 170).stroke();
  doc.lineWidth(3).strokeColor('green').moveTo(50, 175).lineTo(550, 175).stroke();

  doc.moveDown();
}

module.exports = { generatePDFHeader };
