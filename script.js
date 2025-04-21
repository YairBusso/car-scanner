// אלמנטים בדף
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const switchCameraBtn = document.getElementById('switch-camera');
const whatsappInput = document.getElementById('whatsappNumber');
const loadingIndicator = document.getElementById('loading-indicator');
const resultContainer = document.getElementById('result-container');
const detectedPlateElement = document.getElementById('detected-plate');
const editPlateBtn = document.getElementById('edit-plate');
const sendPlateBtn = document.getElementById('send-plate');

// משתנים גלובליים
let currentStream = null;
let facingMode = "environment"; // מתחילים עם המצלמה האחורית
let detectedPlateNumber = "";
let isScanning = false; // דגל לציון אם סריקה מתבצעת כרגע
let scanInterval = null; // משתנה לשמירת ה-interval של הסריקה האוטומטית

// אתחול עבור Tesseract
const initializeTesseract = async () => {
  try {
    await Tesseract.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png', { 
      langPath: 'https://tessdata.projectnaptha.com/4.0.0',
      gzip: false
    });
    console.log('Tesseract טעינת מנוע הושלמה');
    // מתחילים סריקה אוטומטית לאחר אתחול המנוע
    startAutoScan();
  } catch (error) {
    console.error('טעות באתחול Tesseract:', error);
  }
};

// אתחול המצלמה
const initCamera = async () => {
  try {
    // ניתוק הסטרים הנוכחי אם קיים
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
    
    const constraints = {
      video: {
        facingMode: facingMode
      }
    };
    
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = currentStream;
    
    // תיקון לבעיית הפיקסלים בחלק מהמכשירים
    video.onloadedmetadata = () => {
      const { videoWidth, videoHeight } = video;
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      console.log(`מצלמה אותחלה: ${videoWidth}x${videoHeight}`);
      
      // הפעלת סריקה אוטומטית מחדש אם הייתה כבר פעילה
      if (isScanning) {
        startAutoScan();
      }
    };
    
  } catch (err) {
    console.error('שגיאת מצלמה:', err);
    if (facingMode === "environment") {
      // נסיון למצלמה קדמית אם האחורית נכשלה
      facingMode = "user";
      alert('לא ניתן להפעיל את המצלמה האחורית, מנסה מצלמה קדמית...');
      initCamera();
    } else {
      alert('לא ניתן לגשת למצלמה. אנא בדוק את הרשאות המצלמה בדפדפן.');
    }
  }
};

// פונקציה לעיבוד מקדים של תמונה לפני זיהוי
const preprocessImage = (ctx, width, height) => {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // המרה לגווני אפור תוך הגדלת הניגודיות
  for (let i = 0; i < data.length; i += 4) {
    // המרה לגווני אפור על פי משקלות RGB
    const grayscale = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    
    // הגברת ניגודיות
    const contrast = 1.5; // ערך הניגודיות
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const newValue = factor * (grayscale - 128) + 128;
    
    // סף דינמי לשחור-לבן
    const threshold = 120;
    const finalValue = newValue > threshold ? 255 : 0;
    
    data[i] = data[i + 1] = data[i + 2] = finalValue;
  }
  
  ctx.putImageData(imageData, 0, 0);
};

// פונקציה לחיתוך רק אזור לוחית הרישוי
const cropPlateRegion = () => {
  const ctx = canvas.getContext('2d');
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  
  // חיתוך רק חלק מהתמונה (אזור לוחית הרישוי)
  const plateRegionWidth = videoWidth * 0.8;  // 80% מרוחב הוידאו
  const plateRegionHeight = videoHeight * 0.15; // 15% מגובה הוידאו
  const plateX = (videoWidth - plateRegionWidth) / 2;
  const plateY = (videoHeight - plateRegionHeight) / 2;
  
  // ציור התמונה המלאה
  // בדיקה אם צריך לבצע היפוך אופקי של התמונה (תלוי באיזה מצלמה משתמשים)
  if (facingMode === "user") {
    // משתמשים במצלמה קדמית - צריך להפוך את התמונה בחזרה למצב הנכון
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -videoWidth, 0, videoWidth, videoHeight);
    ctx.restore();
  } else {
    // משתמשים במצלמה אחורית - לא צריך היפוך
    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
  }
  
  // חיתוך אזור לוחית הרישוי
  const plateRegion = ctx.getImageData(plateX, plateY, plateRegionWidth, plateRegionHeight);
  canvas.width = plateRegionWidth;
  canvas.height = plateRegionHeight;
  ctx.putImageData(plateRegion, 0, 0);
  
  // עיבוד מקדים של התמונה
  preprocessImage(ctx, plateRegionWidth, plateRegionHeight);
  
  return canvas;
};

// פונקציה לניתוח תוצאת הזיהוי ותיקון הבעיות
const analyzePlateNumber = (rawText) => {
  // הסרת רווחים וזניחת תווים שאינם מספרים
  let plateNumber = rawText.replace(/\s/g, '').replace(/[^0-9]/g, '');
  
  // בדיקה אם המספר "הפוך" - במקרה כזה נהפוך אותו
  if (plateNumber.length >= 7) {
    // אם יש יותר מ-8 ספרות, כנראה שחלק מהמספרים שגויים
    if (plateNumber.length > 8) {
      plateNumber = plateNumber.substring(0, 8);
    }
    return plateNumber;
  }
  
  // בדיקה אם יש מספרים שהתבלבלו בזיהוי - החלפות נפוצות
  plateNumber = plateNumber
    .replace(/O/g, '0')    // O -> 0
    .replace(/I/g, '1')    // I -> 1
    .replace(/Z/g, '2')    // Z -> 2
    .replace(/B/g, '8')    // B -> 8
    .replace(/S/g, '5');   // S -> 5
  
  return plateNumber;
};

// פונקציה לזיהוי לוחית רישוי
const detectLicensePlate = async () => {
  try {
    if (isScanning) {
      showLoadingIndicator(true);
    }
    
    // חיתוך אזור הלוחית
    const plateCanvas = cropPlateRegion();
    
    // שימוש ב-Tesseract לזיהוי מספרים
    const result = await Tesseract.recognize(plateCanvas, {
      lang: 'eng', // אנגלית עובדת טוב יותר עם מספרים
      tessedit_char_whitelist: '0123456789OIZBS', // מספרים + תווים שלפעמים מזוהים בטעות
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE // הנחה שהטקסט בשורה אחת
    });
    
    // ניתוח התוצאה וטיפול במספרים הפוכים
    let plateNumber = analyzePlateNumber(result.data.text);
    console.log('תוצאת זיהוי גולמית:', result.data.text);
    console.log('מספר רכב מעובד:', plateNumber);
    
    // בדיקה אם המספר שזוהה באורך הגיוני ללוחית ישראלית (7-8 ספרות)
    if (plateNumber.length < 7 || plateNumber.length > 8) {
      console.log('אורך המספר לא תקין, מנסה שוב עם הגדרות אחרות');
      
      // ניסיון נוסף עם הגדרות אחרות
      const secondAttempt = await Tesseract.recognize(plateCanvas, {
        lang: 'eng',
        tessedit_char_whitelist: '0123456789OIZBS',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_WORD // הגדרה אחרת לסגמנטצית טקסט
      });
      
      plateNumber = analyzePlateNumber(secondAttempt.data.text);
      console.log('תוצאת ניסיון שני:', plateNumber);
    }
    
    showLoadingIndicator(false);
    
    // החזרת המספר רק אם זוהה מספר באורך תקין
    if (plateNumber.length >= 7 && plateNumber.length <= 8) {
      return plateNumber;
    }
    return '';
  } catch (error) {
    console.error('שגיאה בזיהוי מספר הרכב:', error);
    showLoadingIndicator(false);
    return '';
  }
};

// פונקציה להפעלת סריקה אוטומטית
const startAutoScan = () => {
  // סגירת כל סריקה קודמת אם קיימת
  stopAutoScan();
  
  isScanning = true;
  console.log('מתחיל סריקה אוטומטית...');
  
  // הפעלת סריקה כל 2 שניות
  scanInterval = setInterval(async () => {
    if (!isScanning) {
      return;
    }
    
    try {
      const plateNumber = await detectLicensePlate();
      
      // אם זוהה מספר תקין, עוצרים את הסריקה האוטומטית ומציגים את התוצאה
      if (plateNumber && plateNumber.length >= 7) {
        stopAutoScan();
        console.log('נמצא מספר רכב תקין!', plateNumber);
        showResult(plateNumber);
      }
    } catch (error) {
      console.error('שגיאה בסריקה אוטומטית:', error);
    }
  }, 2000); // בדיקה כל 2 שניות
};

// פונקציה לעצירת הסריקה האוטומטית
const stopAutoScan = () => {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
  isScanning = false;
  showLoadingIndicator(false);
};

// פונקציה להצגת מחוון טעינה
const showLoadingIndicator = (show) => {
  loadingIndicator.style.display = show ? 'block' : 'none';
  if (show) {
    loadingIndicator.textContent = 'מחפש לוחית רישוי...';
  }
};

// פונקציה להצגת תוצאת הזיהוי
const showResult = (plateNumber) => {
  detectedPlateNumber = plateNumber;
  detectedPlateElement.textContent = plateNumber;
  resultContainer.style.display = 'block';
  
  // השמעת צליל התראה כשנמצא מספר רכב
  try {
    const beep = new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU");
    beep.play();
  } catch (e) {
    console.log('לא ניתן להשמיע צליל התראה');
  }
};

// פונקציה לשליחת מספר הרכב בוואטסאפ
const sendToWhatsapp = (plateNumber) => {
  const number = whatsappInput.value.trim();
  if (!/^\d{10,15}$/.test(number)) {
    alert('אנא הזן מספר וואטסאפ תקין (למשל 972501234567)');
    return false;
  }
  
  const message = `מספר רכב לבדיקה: ${plateNumber}`;
  const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank');
  return true;
};

// אירועי לחיצה

// לחיצה על כפתור עריכת מספר לוחית
editPlateBtn.addEventListener('click', () => {
  const editedPlate = prompt('ערוך את מספר הרכב:', detectedPlateNumber);
  if (editedPlate && editedPlate.trim() !== '') {
    showResult(editedPlate);
  }
});

// לחיצה על כפתור שליחה בוואטסאפ
sendPlateBtn.addEventListener('click', () => {
  if (sendToWhatsapp(detectedPlateNumber)) {
    resultContainer.style.display = 'none';
    // מפעילים מחדש את הסריקה האוטומטית אחרי השליחה
    startAutoScan();
  }
});

// לחיצה על כפתור החלפת מצלמה
switchCameraBtn.addEventListener('click', () => {
  stopAutoScan(); // עוצרים סריקה בזמן החלפת מצלמה
  facingMode = facingMode === "environment" ? "user" : "environment";
  initCamera();
});

// אתחול האפליקציה
const initApp = async () => {
  await initializeTesseract();
  await initCamera();
};

// הפעלת האפליקציה
initApp();