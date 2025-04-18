const express = require('express');
const { upload, uploadCustomers, updateCustomersClosingBalance } = require('../../controller/fileupload/uploadscript.js');

const router = express.Router();

// Route for uploading customer data
router.post('/upload-customers', upload.single('file'), uploadCustomers);
router.post('/update-customers', upload.single('file'), updateCustomersClosingBalance);


// Export the router to use in your main app
module.exports = router;
