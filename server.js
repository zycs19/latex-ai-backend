const express = require('express');
const multer = require('multer');
const cors = require('cors');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');  // Add this line
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// API endpoint for LaTeX to PDF conversion
app.post('/api/latex-to-pdf', upload.single('latexFile'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }
  
    const inputPath = req.file.path;
    const outputDir = 'outputs';
    const baseName = path.basename(inputPath, '.tex');
    const outputPath = path.join(outputDir, `${baseName}.pdf`);

    // Ensure the output directory exists
    if (!fs.existsSync(outputDir)){
      fs.mkdirSync(outputDir);
    }

    // Command to compile LaTeX with TikZ support
    const command = `pdflatex -shell-escape -interaction=nonstopmode -output-directory=${outputDir} ${inputPath} && pdflatex -shell-escape -interaction=nonstopmode -output-directory=${outputDir} ${inputPath}`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return res.status(500).json({
          error: 'Error generating PDF',
          details: error.message,
          stdout: stdout,
          stderr: stderr
        });
      }
  
      // Read the file and send its content
      fs.readFile(outputPath, (err, data) => {
        if (err) {
          console.error(`Read error: ${err}`);
          return res.status(500).json({
            error: 'Error reading PDF',
            details: err.message
          });
        }
  
        res.contentType('application/pdf');
        res.send(data);
  
        // Clean up files
        const filesToDelete = [inputPath, outputPath, 
          path.join(outputDir, `${baseName}.aux`),
          path.join(outputDir, `${baseName}.log`)];
        
        filesToDelete.forEach(file => {
          fs.unlink(file, (unlinkErr) => {
            if (unlinkErr) console.error(`Error deleting file ${file}: ${unlinkErr}`);
          });
        });
      });
    });
  });

app.post('/api/chat', upload.array('files'), async (req, res) => {
  try {
    const { message } = req.body;
    const files = req.files;

    let messages = [{ role: 'user', content: message }];

    // If files were uploaded, process them
    if (files && files.length > 0) {
      for (const file of files) {
        if (file.mimetype.startsWith('image/')) {
          // For images, use GPT-4 Vision
          const base64Image = fs.readFileSync(file.path, { encoding: 'base64' });
          const visionResponse = await openai.chat.completions.create({
            model: "gpt-4-turbo",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: "What's in this image? Describe it in detail." },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${file.mimetype};base64,${base64Image}`
                    }
                  },
                ],
              },
            ],
            max_tokens: 300,
          });
          messages.push({
            role: 'user',
            content: `Image description for ${file.originalname}: ${visionResponse.choices[0].message.content}`
          });
        } else {
          // For text files, read the content
          const fileContent = fs.readFileSync(file.path, 'utf8');
          messages.push({
            role: 'user',
            content: `File content of ${file.originalname}:\n${fileContent}`
          });
        }
      }
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
    });

    res.json({ reply: completion.choices[0].message.content });

    // Clean up uploaded files
    if (files) {
      files.forEach(file => {
        fs.unlink(file.path, (err) => {
          if (err) console.error(`Error deleting file: ${err}`);
        });
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred', details: error.message });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
