
// auth_manager.js
// Supabase Integration and Authentication Logic

// Configuration - USER MUST REPLACE THESE VALUES
const SUPABASE_URL = 'https://whsczlmadjgmtbmtlwin.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ftUJ1QsXR3_Xx0zvGJhpsQ_KwiQI0qB';

// Default Admin Credentials (as requested)
const DEFAULT_ADMIN_EMAIL = 'tzongbinn@gmail.com';
const DEFAULT_ADMIN_PASS = '1a2b3c4d';

let supabase;
let currentUser = null;
let isAdmin = false;
let adminMap = null;
let adminMapMarkers = {}; // Store markers on admin map
let activeUsers = {}; // Store active users info

// Initialize Supabase
function initSupabase() {
    if (typeof createClient === 'undefined') {
        // If supabase-js is loaded via CDN, it exposes 'supabase' global, 
        // but the createClient function is usually under 'supabase.createClient' or just 'supabase.createClient' depending on version.
        // With v2 CDN: window.supabase.createClient
        if (window.supabase && window.supabase.createClient) {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } else {
            console.error('Supabase SDK not loaded.');
            return;
        }
    } else {
        supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    initAuthListeners();
    checkSession();
}

// Auth Event Listeners
function initAuthListeners() {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    
    if (loginBtn) {
        loginBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('authEmail').value;
            const password = document.getElementById('authPassword').value;
            await login(email, password);
        });
    }

    if (registerBtn) {
        registerBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('authEmail').value;
            const password = document.getElementById('authPassword').value;
            await register(email, password);
        });
    }
}

// Check existing session
async function checkSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (session) {
        handleUserLogin(session.user);
    }
}

// Login Function
async function login(email, password) {
    showAuthMessage('登入中...', 'info');
    
    // Check if it's the specific hardcoded admin account
    // Note: In a real app, you'd check against the database or use Supabase Auth for this too.
    // Here we use Supabase Auth for everyone, but if the email matches, we grant admin rights locally.
    
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        showAuthMessage(`登入失敗: ${error.message}`, 'error');
        return;
    }

    if (data.user) {
        showAuthMessage('登入成功！', 'success');
        handleUserLogin(data.user);
    }
}

// Register Function
async function register(email, password) {
    showAuthMessage('註冊中...', 'info');
    
    const { data, error } = await supabase.auth.signUp({
        email: email,
        password: password
    });

    if (error) {
        showAuthMessage(`註冊失敗: ${error.message}`, 'error');
        return;
    }

    if (data.user) {
        showAuthMessage('註冊成功！請檢查信箱驗證信（如果開啟了驗證）或直接登入。', 'success');
        // If auto-confirm is on in Supabase, they might be logged in.
        if (data.session) {
            handleUserLogin(data.user);
        }
    }
}

// Handle successful login
function handleUserLogin(user) {
    currentUser = user;
    
    // Check if admin
    if (user.email === DEFAULT_ADMIN_EMAIL) {
        isAdmin = true;
        console.log('Admin logged in');
        showAdminControls();
    } else {
        isAdmin = false;
    }

    // Hide Auth Modal
    document.getElementById('authModal').style.display = 'none';
    
    // Initialize Realtime Sync
    initRealtimeSync();
    
    // If Admin, start admin listeners
    if (isAdmin) {
        initAdminDashboard();
    }
}

function showAuthMessage(msg, type) {
    const el = document.getElementById('authMessage');
    el.textContent = msg;
    el.className = `auth-message ${type}`;
}

// Show Admin specific UI elements
function showAdminControls() {
    // Add Admin Dashboard button to floating controls if not exists
    const container = document.querySelector('.floating-controls');
    if (container && !document.getElementById('adminBtn')) {
        const btn = document.createElement('button');
        btn.id = 'adminBtn';
        btn.className = 'control-btn icon-only';
        btn.title = '管理者儀表板';
        btn.innerHTML = '<span>👑</span>';
        btn.onclick = openAdminDashboard;
        container.appendChild(btn);
    }
}

function openAdminDashboard() {
    const modal = document.getElementById('adminDashboardModal');
    modal.style.display = 'block';
    
    // Init Admin Map if not initialized
    if (!adminMap) {
        setTimeout(initAdminMap, 100); // Delay to ensure container is visible
    }
    
    // Fetch initial data
    fetchActiveUsers();
}

function initAdminMap() {
    adminMap = L.map('adminMap').setView([23.5, 121], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(adminMap);
}

// Tab Switching
window.switchAdminTab = function(tabId) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(`${tabId}Tab`).style.display = 'block';
    // Find button that calls this tab
    const btn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
    if (btn) btn.classList.add('active');
    
    if (tabId === 'usersMap' && adminMap) {
        adminMap.invalidateSize();
    } else if (tabId === 'usersMarkers') {
        fetchAllUsersMarkers();
    }
};

// Realtime Sync Logic for Regular Users
function initRealtimeSync() {
    if (!currentUser) return;

    // 1. Upload/Sync Markers
    // We can hook into the save function or periodically upload
    // For now, let's just upload on load and whenever save happens
    uploadUserData();

    // 2. Broadcast Location
    if (navigator.geolocation) {
        navigator.geolocation.watchPosition((position) => {
            updateUserLocation(position.coords.latitude, position.coords.longitude);
        }, null, { enableHighAccuracy: true });
    }
}

async function uploadUserData() {
    if (!currentUser) return;
    
    // Get local data
    let localDataStr;
    if (window.appStorageGet) {
        localDataStr = await window.appStorageGet('mapAnnotationData');
    } else {
        localDataStr = localStorage.getItem('mapAnnotationData');
    }
    
    const dataToUpload = localDataStr;
    
    if (dataToUpload) {
        // Upsert to Supabase 'user_data' table
        // Table structure assumed: user_id (uuid, pk), email (text), data (jsonb), updated_at (timestamp)
        const { error } = await supabase
            .from('user_data')
            .upsert({ 
                user_id: currentUser.id,
                email: currentUser.email,
                data: typeof dataToUpload === 'string' ? JSON.parse(dataToUpload) : dataToUpload,
                updated_at: new Date()
            });
            
        if (error) console.error('Error uploading data:', error);
    }
}

async function updateUserLocation(lat, lng) {
    if (!currentUser) return;
    
    // Upsert to Supabase 'user_locations' table
    // Table structure: user_id (uuid, pk), email (text), lat (float), lng (float), updated_at (timestamp)
    const { error } = await supabase
        .from('user_locations')
        .upsert({
            user_id: currentUser.id,
            email: currentUser.email,
            lat: lat,
            lng: lng,
            updated_at: new Date()
        });
        
    if (error) console.error('Error updating location:', error);
}

// Admin Functions
function initAdminDashboard() {
    // Subscribe to 'user_locations' changes
    supabase
        .channel('public:user_locations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_locations' }, payload => {
            handleLocationUpdate(payload.new);
        })
        .subscribe();
}

function handleLocationUpdate(locationData) {
    if (!adminMap) return;
    
    const { user_id, email, lat, lng } = locationData;
    
    // Update or create marker on admin map
    if (adminMapMarkers[user_id]) {
        adminMapMarkers[user_id].setLatLng([lat, lng]);
        adminMapMarkers[user_id].setPopupContent(`${email}<br>最後更新: ${new Date().toLocaleTimeString()}`);
    } else {
        const marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'admin-user-marker',
                html: `<div style="background-color: blue; width: 10px; height: 10px; border-radius: 50%;"></div>`,
                iconSize: [10, 10]
            })
        }).addTo(adminMap);
        marker.bindPopup(`${email}<br>最後更新: ${new Date().toLocaleTimeString()}`);
        adminMapMarkers[user_id] = marker;
        
        // Add to list
        updateActiveUsersList(user_id, email);
    }
}

function updateActiveUsersList(userId, email) {
    const list = document.getElementById('userListUL');
    let li = document.getElementById(`user-li-${userId}`);
    if (!li) {
        li = document.createElement('li');
        li.id = `user-li-${userId}`;
        li.innerHTML = `
            <span>${email}</span>
            <span class="user-status-dot online"></span>
        `;
        li.onclick = () => {
            if (adminMapMarkers[userId]) {
                adminMap.setView(adminMapMarkers[userId].getLatLng(), 15);
                adminMapMarkers[userId].openPopup();
            }
        };
        list.appendChild(li);
    }
}

async function fetchActiveUsers() {
    // Fetch recent locations
    const { data, error } = await supabase
        .from('user_locations')
        .select('*')
        .gt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Last 24 hours
        
    if (data) {
        data.forEach(handleLocationUpdate);
    }
}

async function fetchAllUsersMarkers() {
    const container = document.getElementById('allUsersDataList');
    container.innerHTML = '<p>載入中...</p>';
    
    const { data, error } = await supabase
        .from('user_data')
        .select('*');
        
    if (error) {
        container.innerHTML = `<p style="color:red">載入失敗: ${error.message}</p>`;
        return;
    }
    
    container.innerHTML = '';
    
    data.forEach(userData => {
        const userEmail = userData.email;
        const mapData = userData.data;
        const markerCount = mapData.markers ? mapData.markers.length : 0;
        const groupCount = mapData.groups ? mapData.groups.length : 0;
        const updatedAt = new Date(userData.updated_at).toLocaleString();
        
        const card = document.createElement('div');
        card.className = 'user-data-card';
        card.innerHTML = `
            <div class="user-data-header">
                <span>${userEmail}</span>
                <span>${updatedAt}</span>
            </div>
            <div class="user-stats">
                <span>📍 標註點: ${markerCount}</span>
                <span>📁 組別: ${groupCount}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

// Hook into save operation to upload data
// We'll expose a function that script.js can call
window.authManagerUpload = uploadUserData;

// Initialize on load
document.addEventListener('DOMContentLoaded', initSupabase);

