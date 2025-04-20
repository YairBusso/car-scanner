const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('capture');
const whatsappInput = document.getElementById('whatsappNumber');

navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => {
    video.srcObject = stream;
  })
  .catch(err => {
    alert('בעיה בגישה למצלמה');
    console.error(err);
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
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  });
};
