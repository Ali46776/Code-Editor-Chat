// server.js - KALICILIK, SİLME VE YENİ SENKRONİZASYON MANTIĞI İLE GÜNCELLENDİ

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs'); // Dosya okuma/yazma için gerekli
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

// Veri depolama
const users = {};
const projectFiles = {};
let fileIdCounter = 1;

// Sohbet geçmişini saklayacağımız dosya yolu
const CHAT_FILE = path.join(__dirname, 'chat_history.json');
let chatHistory = [];

// Yardımcı Fonksiyon: Sohbeti diske kaydet
function saveChatHistory() {
    try {
        fs.writeFileSync(CHAT_FILE, JSON.stringify(chatHistory, null, 2));
        console.log('Sohbet geçmişi diske kaydedildi.');
    } catch (error) {
        console.error('Sohbet geçmişi kaydı başarısız:', error);
    }
}

// Yardımcı Fonksiyon: Sohbeti diskten yükle
function loadChatHistory() {
    try {
        if (fs.existsSync(CHAT_FILE)) {
            const data = fs.readFileSync(CHAT_FILE, 'utf8');
            chatHistory = JSON.parse(data);
            console.log('Sohbet geçmişi diskten yüklendi. Mesaj sayısı:', chatHistory.length);
        }
    } catch (error) {
        console.error('Sohbet geçmişi yüklenirken hata:', error);
        chatHistory = []; // Hata varsa boş başlat
    }
}

// Sunucu başladığında sohbeti yükle
loadChatHistory();

app.use(express.static(path.join(__dirname, 'frontend')));
app.use(express.json());

// Giriş ve Kayıt API'leri (Aynı kaldı)
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (users[username]) {
        return res.status(400).json({ success: false, message: 'Bu kullanıcı adı zaten mevcut.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    users[username] = { password: hashedPassword, files: [] };
    res.json({ success: true, message: 'Kayıt başarılı.' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users[username];
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ success: false, message: 'Geçersiz kullanıcı adı veya şifre.' });
    }
    res.json({ success: true, message: 'Giriş başarılı.', username });
});

// Dosya Listesi ve İçeriği API'leri (Aynı kaldı)
app.get('/api/files', (req, res) => {
    res.json(Object.values(projectFiles).map(f => ({ id: f.id, name: f.name, owner: f.owner })));
});

app.get('/api/file/:id', (req, res) => {
    const file = projectFiles[req.params.id];
    if (!file) {
        return res.status(404).json({ success: false, message: 'Dosya bulunamadı.' });
    }
    res.json({ success: true, content: file.content, language: file.language });
});


// SOCKET.IO İŞLEMLERİ
io.on('connection', (socket) => {
    console.log('Yeni bir kullanıcı bağlandı:', socket.id);
    socket.emit('chat history', chatHistory); // Bağlanan kullanıcıya kalıcı geçmişi gönder

    // 1. CHAT MESAJI ALMA VE YAYINLAMA
    socket.on('chat message', (msg) => {
        const user = msg.user || 'Anonim';
        const text = msg.text.trim();
        
        // ÖZEL KOMUT KONTROLÜ: Sohbeti Silme
        if (text === '/sohbetisil') {
            chatHistory = []; // Belleği temizle
            saveChatHistory(); // Diski temizle
            io.emit('chat cleared'); // Herkese sohbetin silindiğini bildir
            io.emit('chat message', { 
                text: `${user} tarafından sohbet geçmişi temizlendi.`, 
                user: 'Sistem', 
                timestamp: new Date().toLocaleTimeString('tr-TR')
            });
            return;
        }

        if (text) {
            const message = { 
                text: text, 
                user: user, 
                timestamp: new Date().toLocaleTimeString('tr-TR') 
            };
            
            chatHistory.push(message); 
            saveChatHistory(); // KRİTİK: Her mesajda diske kaydet
            io.emit('chat message', message); 
        }
    });

    // ************************************************
    // YENİ CODE CHANGE KISMI (Change objesi alıp yayınlar)
    // ************************************************
    socket.on('code change', ({ fileId, change }) => {
        const file = projectFiles[fileId];
        if (file) {
            // NOT: Sunucu tarafında content guncellemesi (replaceRange mantığı) 
            // şimdilik atlanmıştır, yalnızca anlık yayına odaklanılmıştır.
            // Kalıcılık için burada CodeMirror'ın change objesini uygulamak gerekir.
            
            // Değişikliği yapan hariç herkese yayınla (change objesini gönderiyoruz)
            socket.broadcast.emit('file updated', { fileId, change });
        }
    });
    // ************************************************
    // CODE CHANGE KISMI SONU
    // ************************************************

    socket.on('new file', (fileData) => {
        const newFileId = fileIdCounter++;
        const extension = fileData.fileName.split('.').pop().toLowerCase();
        
        let mode = 'clike';
        if (extension === 'js' || extension === 'json') mode = 'javascript';
        else if (extension === 'html') mode = 'htmlmixed';
        else if (extension === 'css') mode = 'css';
        else if (extension === 'xml') mode = 'xml';
        else if (extension === 'cs') mode = 'text/x-csharp';
        else mode = 'null';

        const newFile = {
            id: newFileId,
            name: fileData.fileName,
            content: fileData.content,
            owner: fileData.owner,
            language: mode
        };
        projectFiles[newFileId] = newFile;
        io.emit('file added', { id: newFileId, name: newFile.name, owner: newFile.owner });
    });

    socket.on('disconnect', () => {
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

// Sunucuyu başlat
server.listen(PORT, () => {
    console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});