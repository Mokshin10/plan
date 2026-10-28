// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyBHkZUAPpv0Oz0kyEQxRBGix4ycZRFfn0M",
    authDomain: "my-cars-app-2b2c3.firebaseapp.com",
    projectId: "my-cars-app-2b2c3",
    storageBucket: "my-cars-app-2b2c3.firebasestorage.app",
    messagingSenderId: "10200558251",
    appId: "1:10200558251:web:2ada73bf42f0ba7af165ee"
};

// Инициализация
firebase.initializeApp(firebaseConfig);

// Сервисы
const db = firebase.firestore();
const auth = firebase.auth();

console.log('Firebase инициализирован:', firebaseConfig.projectId);