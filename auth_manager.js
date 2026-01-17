console.log('Supabase client script loading...');

const SUPABASE_URL = 'https://fqoxszrfvvfzqkbuyjkt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxb3hzenJmdnZmenFrYnV5amt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNTk1MTYsImV4cCI6MjA3MDgzNTUxNn0.MHnVGYjUxUpDv11ej2xqByV-WXA_Sub9hQuXbKtBEC4';

let supabase = null;
let currentUser = null;
let userProfile = null;

// Define UI functions FIRST so they are available even if init fails
// NOTE: These are now also defined inline in index.html for robustness.
// We keep them here to ensure full functionality (like updateAuthUI calls) is bound correctly if this loads later.

function showAuthModal() {
    console.log('showAuthModal (script) called');
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'block';
        if (window.updateAuthUI) updateAuthUI();
        
        // Remove warning if exists
        const warning = document.getElementById('supabase-warning');
        if (warning) warning.remove();
    }
}
window.showAuthModal = showAuthModal;

function closeAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) modal.style.display = 'none';
}
window.closeAuthModal = closeAuthModal;

function switchAuthMode(mode) {
    const loginForm = document.getElementById('loginFormSection');
    const registerForm = document.getElementById('registerFormSection');
    if (loginForm && registerForm) {
        loginForm.style.display = mode === 'login' ? 'block' : 'none';
        registerForm.style.display = mode === 'register' ? 'block' : 'none';
    }
}
window.switchAuthMode = switchAuthMode;

function showAdminPanel() {
    closeAuthModal();
    const modal = document.getElementById('adminPanelModal');
    if (modal) {
        modal.style.display = 'block';
        loadAdminUserList();
    }
}
window.showAdminPanel = showAdminPanel;

function closeAdminPanel() {
    const modal = document.getElementById('adminPanelModal');
    if (modal) modal.style.display = 'none';
}
window.closeAdminPanel = closeAdminPanel;

// Safe Initialization
try {
    if (window.supabase && window.supabase.createClient) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('Supabase client initialized');
    } else {
        console.error('Supabase SDK not loaded or createClient missing');
    }
} catch (e) {
    console.error('Error initializing Supabase:', e);
}

// Auth Actions
async function handleRegister(e) {
    e.preventDefault();
    if (!supabase) return;
    
    const emailInput = document.getElementById('registerEmail');
    const passInput = document.getElementById('registerPassword');
    if (!emailInput || !passInput) return;

    const email = emailInput.value;
    const password = passInput.value;
    
    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });
        
        if (error) {
            alert('註冊失敗: ' + error.message);
        } else {
            alert('註冊成功！請檢查您的 Email 進行驗證 (如果已開啟驗證) 或直接登入。');
            switchAuthMode('login');
        }
    } catch (err) {
        console.error('Register error:', err);
        alert('註冊發生錯誤');
    }
}
window.handleRegister = handleRegister;

async function handleLogin(e) {
    e.preventDefault();
    if (!supabase) return;

    const emailInput = document.getElementById('loginEmail');
    const passInput = document.getElementById('loginPassword');
    if (!emailInput || !passInput) return;

    const email = emailInput.value;
    const password = passInput.value;
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        
        if (error) {
            alert('登入失敗: ' + error.message);
        } else {
            alert('登入成功！');
            currentUser = data.user;
            await updateAuthUI();
            closeAuthModal();
            // Sync data after login
            await syncDataWithSupabase();
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('登入發生錯誤');
    }
}
window.handleLogin = handleLogin;

async function handleLogout() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
        alert('登出失敗: ' + error.message);
    } else {
        alert('已登出');
        currentUser = null;
        userProfile = null;
        await updateAuthUI();
        location.reload();
    }
}
window.handleLogout = handleLogout;

async function updateAuthUI() {
    if (!supabase) return;
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;

        const loginSection = document.getElementById('loginFormSection');
        const registerSection = document.getElementById('registerFormSection');
        const profileSection = document.getElementById('userProfileSection');
        const emailDisplay = document.getElementById('userEmailDisplay');
        const roleDisplay = document.getElementById('userRoleDisplay');
        const adminControls = document.getElementById('adminControls');

        if (currentUser) {
            if(loginSection) loginSection.style.display = 'none';
            if(registerSection) registerSection.style.display = 'none';
            if(profileSection) profileSection.style.display = 'block';
            if(emailDisplay) emailDisplay.textContent = currentUser.email;
            
            // Fetch profile for role
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
            userProfile = profile;
            if(roleDisplay) roleDisplay.textContent = profile?.role || 'user';
            
            if (adminControls) {
                if (profile?.role === 'admin') {
                    adminControls.style.display = 'block';
                } else {
                    adminControls.style.display = 'none';
                }
            }
        } else {
            if(loginSection) loginSection.style.display = 'block';
            if(registerSection) registerSection.style.display = 'none';
            if(profileSection) profileSection.style.display = 'none';
        }
    } catch (err) {
        console.error('Error updating auth UI:', err);
    }
}

// Data Sync
async function syncDataWithSupabase() {
    if (!currentUser || !supabase) return;
    
    if (window.showNotification) window.showNotification('正在同步雲端資料...', 'info');
    
    try {
        // 1. Fetch Markers
        const { data: remoteMarkers, error: markersError } = await supabase.from('user_markers').select('*');
        if (markersError) throw markersError;
        
        // 2. Fetch Groups
        const { data: remoteGroups, error: groupsError } = await supabase.from('user_groups').select('*');
        if (groupsError) throw groupsError;
        
        const newMarkers = remoteMarkers.map(m => ({
            id: m.id,
            name: m.name,
            description: m.description,
            lat: m.lat,
            lng: m.lng,
            groupId: m.group_id,
            subgroupId: m.subgroup_id,
            color: m.color,
            icon: m.icon,
            imageData: m.image_data, 
            routeRecords: m.route_records
        }));
        
        const newGroups = remoteGroups.map(g => ({
            id: g.id,
            name: g.name,
            subgroups: g.subgroups.map(sg => ({
                id: sg.id,
                name: sg.name,
                groupId: sg.groupId || g.id 
            }))
        }));
        
        window.isSyncing = true;
        if (window.updateAppState) {
            window.updateAppState(newMarkers, newGroups);
            if (window.showNotification) window.showNotification('雲端資料同步完成', 'success');
        } else {
            console.error('updateAppState function not found in script.js');
        }
        window.isSyncing = false;
        
    } catch (e) {
        console.error('Sync failed:', e);
        window.isSyncing = false;
        if (window.showNotification) window.showNotification('同步失敗: ' + e.message, 'error');
    }
}

async function saveToSupabase(markers, groups) {
    if (!supabase) return;
    // Only save if we have a user and they are NOT viewing someone else's data (admin view)
    // For now, assuming standard user flow.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    
    if (!user) return;
    
    const dbMarkers = markers.map(m => ({
        id: m.id.toString(),
        user_id: user.id,
        name: m.name,
        description: m.description,
        lat: m.lat,
        lng: m.lng,
        group_id: m.groupId,
        subgroup_id: m.subgroupId,
        color: m.color,
        icon: m.icon,
        image_data: m.imageData,
        route_records: m.routeRecords
    }));
    
    const dbGroups = groups.map(g => ({
        id: g.id.toString(),
        user_id: user.id,
        name: g.name,
        subgroups: g.subgroups
    }));
    
    try {
        // Delete all for user first (simplest sync strategy)
        await supabase.from('user_markers').delete().eq('user_id', user.id);
        await supabase.from('user_groups').delete().eq('user_id', user.id);
        
        if (dbMarkers.length > 0) {
            const { error: mError } = await supabase.from('user_markers').insert(dbMarkers);
            if (mError) throw mError;
        }
        
        if (dbGroups.length > 0) {
            const { error: gError } = await supabase.from('user_groups').insert(dbGroups);
            if (gError) throw gError;
        }
        
        console.log('Saved to Supabase');
    } catch (e) {
        console.error('Save to Supabase failed:', e);
    }
}

// Admin Functions
async function loadAdminUserList() {
    if (!supabase) return;
    const list = document.getElementById('adminUserList');
    if (!list) return;
    list.innerHTML = '<li>Loading...</li>';
    
    const { data: profiles, error } = await supabase.from('profiles').select('*');
    
    if (error) {
        list.innerHTML = '<li>Error loading users: ' + error.message + '</li>';
        return;
    }
    
    list.innerHTML = '';
    profiles.forEach(p => {
        const li = document.createElement('li');
        li.textContent = `${p.email} (${p.role})`;
        li.style.cursor = 'pointer';
        li.style.padding = '10px';
        li.style.borderBottom = '1px solid #eee';
        li.onclick = () => loadUserMarkersForAdmin(p.id, p.email);
        list.appendChild(li);
    });
}

async function loadUserMarkersForAdmin(userId, userEmail) {
    if (!supabase) return;
    if (window.showNotification) window.showNotification(`正在載入使用者 ${userEmail} 的資料...`, 'info');
    closeAdminPanel();
    
    const { data: markers, error } = await supabase.from('user_markers').select('*').eq('user_id', userId);
    const { data: groups, error: gError } = await supabase.from('user_groups').select('*').eq('user_id', userId);
    
    if (error || gError) {
        if (window.showNotification) window.showNotification('載入使用者資料失敗', 'error');
        return;
    }
    
    const newMarkers = markers.map(m => ({
        id: m.id,
        name: m.name,
        description: m.description,
        lat: m.lat,
        lng: m.lng,
        groupId: m.group_id,
        subgroupId: m.subgroup_id,
        color: m.color,
        icon: m.icon,
        imageData: m.image_data,
        routeRecords: m.route_records
    }));
    
    const newGroups = groups.map(g => ({
        id: g.id,
        name: g.name,
        subgroups: g.subgroups
    }));
    
    if (window.updateAppState) {
        // Disable auto-save when viewing others data
        window.isViewingOtherUser = true;
        window.isSyncing = true; // Also prevent sync loop just in case
        window.updateAppState(newMarkers, newGroups);
        window.isSyncing = false;
        if (window.showNotification) window.showNotification(`已顯示使用者 ${userEmail} 的 ${newMarkers.length} 個標註點`, 'success');
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (!supabase) return;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user;
        if (currentUser) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
            userProfile = profile;
            // Auto sync on load
            setTimeout(syncDataWithSupabase, 1000);
        }
    } catch (err) {
        console.error('Session check error:', err);
    }
});

// Expose functions globally for script.js to call
window.supabaseClient = {
    saveToSupabase,
    getCurrentUser: () => currentUser
};
