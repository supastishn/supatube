/**
 * Utility function for printing the current page
 */
export const printCurrentPage = () => {
  window.print();
};

/**
 * Print a specific element by its selector
 * @param {string} selector - CSS selector for the element to print
 */
export const printElement = (selector) => {
  const element = document.querySelector(selector);
  if (!element) {
    console.error(`Element with selector "${selector}" not found`);
    return;
  }
  
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  
  // Add element content and styles
  printWindow.document.write(`
    <html>
      <head>
        <title>Print</title>
        <style>
          body { font-family: sans-serif; }
        </style>
      </head>
      <body>
        ${element.innerHTML}
      </body>
    </html>
  `);
  
  // Trigger print and close window after printing
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.onafterprint = () => printWindow.close();
};

/**
 * Print data as a formatted document
 * @param {object} data - Data to print
 * @param {string} title - Document title
 */
export const printData = (data, title = 'Printed Data') => {
  // Create a new window for printing
  const printWindow = window.open('', '_blank');
  
  // Format data as readable HTML
  const formattedContent = typeof data === 'object' 
    ? `<pre>${JSON.stringify(data, null, 2)}</pre>`
    : data;
  
  // Add content and basic styling
  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; }
          pre { background: #f5f5f5; padding: 15px; border-radius: 5px; }
          h1 { color: #333; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        ${formattedContent}
      </body>
    </html>
  `);
  
  // Trigger print and close window after printing
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  printWindow.onafterprint = () => printWindow.close();
};
