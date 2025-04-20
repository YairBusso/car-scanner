const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('capture');
const whatsappInput = document.getElementById('whatsappNumber');

navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { exact: "environment" } // מבקש את המצלמה האחורית
    }
  })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(err => {
    alert('לא הצלחנו להפעיל את המצלמה האחורית, מנסים מצלמה רגילה...');
    console.error(err);
  
    // fallback למצלמה רגילה
    navigator.mediaDevices.getUserMedia({ video: true }).then(fallbackStream => {
      video.srcObject = fallbackStream;
    });
  });
  

captureBtn.onclick = () => {
  const number = whatsappInput.value.trim();
  if (!/^\d{10,15}$/.test(number)) {
    alert('אנא הזן מספר WhatsApp חוקי (למשל 972501234567)');
    return;
  }

  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  Tesseract.recognize(canvas, 'eng').then(result => {
    const plateNumber = result.data.text.replace(/\s/g, '').replace(/[^0-9]/g, '');
    const message = `מספר רכב לבדיקה: ${plateNumber}`;
    alert(`המספר רבכ שנקלט ${plateNumber}`);
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  });
};
