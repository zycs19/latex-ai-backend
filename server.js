const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI);

// Set up multer for file upload
const upload = multer({ dest: 'uploads/' });

// API endpoint for LaTeX to PDF conversion
app.post('/api/latex-to-pdf', upload.single('latexFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const inputPath = req.file.path;
  const outputPath = path.join('outputs', `${req.file.filename}.pdf`);

  exec(`pdflatex -output-directory=outputs ${inputPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).send('Error generating PDF');
    }

    // Read the file and send its content
    fs.readFile(outputPath, (err, data) => {
      if (err) {
        console.error(`Read error: ${err}`);
        return res.status(500).send('Error reading PDF');
      }

      res.contentType('application/pdf');
      res.send(data);
      console.log('PDF sent to frontend');
      console.log(data);

      // Clean up files
      fs.unlinkSync(inputPath);
      fs.unlinkSync(outputPath);
    });
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
