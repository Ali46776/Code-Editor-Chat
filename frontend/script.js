// frontend/script.js - GÜNCEL VE SON VERSİYON

const socket = io();
let currentUser = null;
let currentFileId = null;
let codeMirrorInstance;

// Dil modları tanımlaması (C# ve JSON için doğru modlar ayarlandı)
const languageModes = {
    'js': { name: 'JavaScript', mode: 'javascript' },
    'html': { name: 'HTML', mode: 'htmlmixed' },
    'css': { name: 'CSS', mode: 'css' },
    'cs': { name: 'C#', mode: 'text/x-csharp' }, 
    'json': { name: 'JSON', mode: 'application/json' }, 
    'xml': { name: 'XML', mode: 'xml' },
    'default': { name: 'Düz Metin', mode: 'null' }
};

document.addEventListener('DOMContentLoaded', () => {
    const editorElement = document.getElementById('code-editor');
    
    // CodeMirror başlatma
    codeMirrorInstance = CodeMirror.fromTextArea(editorElement, {
        lineNumbers: true,
        mode: 'javascript', 
        theme: 'monokai',
        lineWrapping: true,
        tabSize: 4,
        indentUnit: 4,
        indentWithTabs: false
    });

    // Anlık Senkronizasyon: CodeMirror içeriği değiştiğinde sunucuya bildir
    codeMirrorInstance.on('change', () => {
        if (currentFileId && currentUser) {
            const newContent = codeMirrorInstance.getValue();
            socket.emit('code change', { 
                fileId: currentFileId, 
                newContent: newContent 
            });
        }
    });

    // Dil seçimi dropdown menüsünü doldur
    const languageSelect = document.getElementById('language-select');
    languageSelect.innerHTML = ''; // Temizle
    
    // Sadece benzersiz modları ekle
    const addedModes = new Set();
    Object.values(languageModes).forEach(lang => {
        if (!addedModes.has(lang.mode)) {
            const option = document.createElement('option');
            option.value = lang.mode; 
            option.textContent = lang.name;
            languageSelect.appendChild(option);
            addedModes.add(lang.mode);
        }
    });

    // Sohbet inputuna Enter olay dinleyicisi eklendi (Sohbet düzeltmesi)
    document.getElementById('chat-input').addEventListener('keydown', handleChatInput);

    fetchFiles();
});

// DİL MODUNU DEĞİŞTİRME
function changeLanguageMode() {
    const modeValue = document.getElementById('language-select').value;
    codeMirrorInstance.setOption('mode', modeValue);
}

// YEREL DOSYAYI OKUMA VE SUNUCUYA GÖNDERME
function uploadFileFromLocal(event) {
    if (!currentUser) {
        alert('Lütfen önce giriş yapın.');
        return;
    }

    const file = event.target.files[0]; 
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (e) => {
        const content = e.target.result;
        const fileName = file.name;
        const extension = fileName.split('.').pop().toLowerCase();
        
        // Uzantıya göre modu belirleme
        let language = languageModes[extension] ? languageModes[extension].mode : languageModes['default'].mode;
        
        socket.emit('new file', {
            fileName: fileName,
            content: content,
            owner: currentUser,
            language: language 
        });

        event.target.value = ''; 
    };

    reader.readAsText(file);
}

// DOSYA LİSTESİNİ SUNUCUDAN ÇEKME
async function fetchFiles() {
    try {
        const response = await fetch('/api/files');
        const files = await response.json();
        renderFileList(files);
    } catch (error) {
        console.error('Dosyalar çekilemedi:', error);
    }
}

// DOSYA LİSTESİNİ EKRANA YAZDIRMA
function renderFileList(files) {
    const fileListElement = document.getElementById('file-list');
    fileListElement.innerHTML = ''; 
    files.forEach(file => {
        const li = document.createElement('li');
        li.textContent = `${file.name} (Sahip: ${file.owner})`;
        li.onclick = () => loadFileContent(file.id, file.name);
        if (file.id === currentFileId) {
             li.style.fontWeight = 'bold';
             li.style.color = '#e6c07b';
        }
        fileListElement.appendChild(li);
    });
}

// DOSYA İÇERİĞİNİ YÜKLEME VE EDİTÖRÜ GÜNCELLEME
async function loadFileContent(fileId, fileName) {
    currentFileId = fileId; 
    document.getElementById('current-file-name').textContent = fileName;
    
    try {
        const response = await fetch(`/api/file/${fileId}`);
        const data = await response.json();
        
        if (data.success) {
            codeMirrorInstance.setValue(data.content);
            
            // Dil modunu CodeMirror'a ayarla
            codeMirrorInstance.setOption('mode', data.language);

            // Dil seçme kutusunu ayarla
            document.getElementById('language-select').value = data.language;

            codeMirrorInstance.refresh();
            fetchFiles(); // Seçili dosyayı vurgulamak için listeyi yenile
        } else {
            alert(data.message);
        }
    } catch (error) {
        console.error('Dosya yüklenirken hata:', error);
    }
}

// KULLANICI İŞLEMLERİ 
async function registerUser() { 
    const username = document.getElementById('username-input').value;
    const password = document.getElementById('password-input').value;
    const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    document.getElementById('auth-status').textContent = data.message;
}

async function loginUser() { 
    const username = document.getElementById('username-input').value;
    const password = document.getElementById('password-input').value;
    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    document.getElementById('auth-status').textContent = data.message;
    
    if (data.success) {
        currentUser = data.username;
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('file-management').style.display = 'block';
        document.getElementById('current-user-display').textContent = currentUser;
        
        fetchFiles();
    }
}

function logoutUser() { 
    currentUser = null;
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('file-management').style.display = 'none';
    document.getElementById('auth-status').textContent = 'Çıkış yapıldı.';
}

// CHAT İŞLEMLERİ
function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const text = chatInput.value.trim();
    if (text) {
        const user = currentUser || 'Anonim';
        socket.emit('chat message', { text, user });
        chatInput.value = '';
    }
}

// Enter tuşu ile gönderme
function handleChatInput(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); 
        sendChatMessage();
    }
}


// SOCKET İSTEMCİ DİNLEYİCİLERİ 
socket.on('chat history', (history) => {
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';
    history.forEach(msg => {
        displayChatMessage(msg);
    });
});

socket.on('chat message', (msg) => {
    displayChatMessage(msg);
});

function displayChatMessage(msg) {
    const chatBox = document.getElementById('chat-box');
    const msgElement = document.createElement('div');
    msgElement.classList.add('chat-message');
    msgElement.innerHTML = `<strong>${msg.user}:</strong> ${msg.text} <span class="time">(${msg.timestamp})</span>`;
    chatBox.appendChild(msgElement);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// KRİTİK: Sohbet kalıcılığı için temizleme bildirimi
socket.on('chat cleared', () => {
    document.getElementById('chat-box').innerHTML = '';
});

socket.on('file added', (file) => {
    fetchFiles();
});

// Anlık Senkronizasyon Güncellemesi
socket.on('file updated', ({ fileId, newContent }) => {
    if (fileId === currentFileId) {
        const cursor = codeMirrorInstance.getCursor();
        codeMirrorInstance.setValue(newContent);
        codeMirrorInstance.setCursor(cursor);
    }
});