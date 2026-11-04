
// ========================================
// KETTEN – SUPABASE BEÁLLÍTÁSOK
// ========================================

const SUPABASE_URL = "https://pvlbkfgwwzfrtbehhxuh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1FnbDfKBi2VMT3fXXXCK2Q_0zDiaAH3";

if (!window.supabase) {
  document.body.innerHTML = `
    <p style="padding:24px">
      Nem sikerült betölteni a Supabase könyvtárat.
      Frissítsd az oldalt, és próbáld újra.
    </p>`;
  throw new Error("A Supabase könyvtár nem töltődött be.");
}

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const BUCKET_NAME = "ketten-kepek";

let currentUser = null;
let currentCouple = null;
let currentAlbumId = "";
let coupleStartDate = null;
let timerInterval = null;

// ========================================
// SEGÉDFÜGGVÉNYEK
// ========================================

const $ = (id) => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function showFeedback(id, message) {
  const element = $(id);
  if (element) element.textContent = message;
}

function setButtonLoading(button, loading, originalText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Kérlek, várj..." : originalText;
}

function formatDate(dateValue) {
  if (!dateValue) return "";

  const date = new Date(dateValue + "T00:00:00");

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("hu-HU");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function showView(viewId) {
  ["auth-view", "pair-view", "app-view"].forEach((id) => {
    const element = $(id);
    if (element) element.hidden = id !== viewId;
  });
}

function handleError(message, error) {
  console.error(message, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
    fullError: error
  });

  const details = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code
  ].filter(Boolean).join(" | ");

  showToast(message + " " + (details || "Részletek a konzolban."));
}

function addListener(id, eventName, callback) {
  const element = $(id);

  if (!element) {
    console.warn("Hiányzó HTML elem:", id);
    return;
  }

  element.addEventListener(eventName, callback);
}

// ========================================
// NAVIGÁCIÓ
// ========================================

document.querySelectorAll('.nav a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));

    if (!target) return;

    event.preventDefault();

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
});

// ========================================
// BEJELENTKEZÉS ÉS REGISZTRÁCIÓ
// ========================================

addListener("show-login", "click", () => {
  $("login-form").hidden = false;
  $("register-form").hidden = true;
  showFeedback("auth-feedback", "");
});

addListener("show-register", "click", () => {
  $("login-form").hidden = true;
  $("register-form").hidden = false;
  showFeedback("auth-feedback", "");
});

addListener("register-form", "submit", async (event) => {
  event.preventDefault();

  const button = event.currentTarget.querySelector(
    'button[type="submit"]'
  );
  const originalText = button.textContent;

  const email = $("register-email").value.trim();
  const password = $("register-password").value;

  setButtonLoading(button, true, originalText);
  showFeedback("auth-feedback", "Fiók létrehozása...");

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    if (!data.session) {
      showFeedback(
        "auth-feedback",
        "Sikeres regisztráció! Ellenőrizd az e-mailjeidet, majd igazold vissza a címedet."
      );
    } else {
      showFeedback("auth-feedback", "Sikeres regisztráció!");
    }
  } catch (error) {
    showFeedback("auth-feedback", error.message);
  } finally {
    setButtonLoading(button, false, originalText);
  }
});

addListener("login-form", "submit", async (event) => {
  event.preventDefault();

  const button = event.currentTarget.querySelector(
    'button[type="submit"]'
  );
  const originalText = button.textContent;

  const email = $("login-email").value.trim();
  const password = $("login-password").value;

  setButtonLoading(button, true, originalText);
  showFeedback("auth-feedback", "Bejelentkezés...");

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    showFeedback("auth-feedback", "Sikeres bejelentkezés!");
  } catch (error) {
    showFeedback("auth-feedback", error.message);
  } finally {
    setButtonLoading(button, false, originalText);
  }
});

addListener("logout-button", "click", async () => {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    handleError("Nem sikerült kijelentkezni:", error);
  }
});

// ========================================
// KÖZÖS TÉR LÉTREHOZÁSA
// ========================================

addListener("create-couple-form", "submit", async (event) => {
  event.preventDefault();

  const button = event.currentTarget.querySelector(
    'button[type="submit"]'
  );
  const originalText = button.textContent;

  const name = $("couple-name").value.trim();
  const startDate = $("couple-start-date").value;

  setButtonLoading(button, true, originalText);
  showFeedback("pair-feedback", "Közös tér létrehozása...");

  try {
    const { error } = await supabaseClient.rpc("create_couple", {
      p_name: name,
      p_start_date: startDate
    });

    if (error) throw error;

    showToast("Elkészült a közös teretek! ♡");
    await refreshApp();
  } catch (error) {
    showFeedback("pair-feedback", error.message);
  } finally {
    setButtonLoading(button, false, originalText);
  }
});

// ========================================
// CSATLAKOZÁS MEGHÍVÓKÓDDAL
// ========================================

addListener("join-couple-form", "submit", async (event) => {
  event.preventDefault();

  const button = event.currentTarget.querySelector(
    'button[type="submit"]'
  );
  const originalText = button.textContent;

  const inviteCode = $("invite-code").value.trim();

  setButtonLoading(button, true, originalText);
  showFeedback("pair-feedback", "Csatlakozás...");

  try {
    const { error } = await supabaseClient.rpc("join_couple", {
      p_invite_code: inviteCode
    });

    if (error) throw error;

    showToast("Sikeresen csatlakoztál! ♡");
    await refreshApp();
  } catch (error) {
    showFeedback("pair-feedback", error.message);
  } finally {
    setButtonLoading(button, false, originalText);
  }
});

// ========================================
// ALKALMAZÁS BETÖLTÉSE
// ========================================

async function refreshApp() {
  if (!currentUser) {
    showView("auth-view");
    return;
  }

  try {
    const { data: membership, error } = await supabaseClient
      .from("couple_members")
      .select("couple_id, couples(id, name, start_date)")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) throw error;

    if (!membership || !membership.couples) {
      currentCouple = null;
      coupleStartDate = null;
      showView("pair-view");
      return;
    }

    currentCouple = membership.couples;
    coupleStartDate = currentCouple.start_date;

    showView("app-view");

    $("couple-title").textContent = currentCouple.name;
    $("since-label").textContent =
      "Kezdete: " + formatDate(currentCouple.start_date);

    startCoupleTimer();

    await loadInviteCode();
    await loadMemories();
    await loadAlbums();
  } catch (error) {
    handleError("Nem sikerült betölteni a közös teret:", error);
  }
}

// ========================================
// MEGHÍVÓKÓD
// ========================================

async function loadInviteCode() {
  const { data, error } = await supabaseClient.rpc("get_my_invite_code");

  if (error) {
    $("invite-code-display").textContent = "Nem elérhető";
    console.error("Meghívókód hiba:", error);
    return;
  }

  const code = typeof data === "string"
    ? data
    : data?.code || data?.invite_code || "";

  $("invite-code-display").textContent = code || "—";
}

addListener("copy-invite-button", "click", async () => {
  const code = $("invite-code-display").textContent;

  if (!code || code === "—" || code === "Nem elérhető") {
    showToast("Nincs másolható meghívókód.");
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    showToast("Meghívókód másolva! ♡");
  } catch {
    showToast("Nem sikerült másolni a kódot.");
  }
});

// ========================================
// EGYÜTT TÖLTÖTT IDŐ
// ========================================

function startCoupleTimer() {
  if (timerInterval) clearInterval(timerInterval);

  function updateTimer() {
    if (!coupleStartDate) return;

    const start = new Date(coupleStartDate + "T00:00:00");
    const now = new Date();

    let difference = Math.max(0, now.getTime() - start.getTime());

    const days = Math.floor(difference / 86400000);
    difference %= 86400000;

    const hours = Math.floor(difference / 3600000);
    difference %= 3600000;

    const minutes = Math.floor(difference / 60000);
    difference %= 60000;

    const seconds = Math.floor(difference / 1000);

    $("days").textContent = days.toLocaleString("hu-HU");
    $("hours").textContent = hours;
    $("minutes").textContent = minutes;
    $("seconds").textContent = seconds;
  }

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

// ========================================
// KÖZÖS EMLÉKEK
// ========================================

addListener("memory-form", "submit", async (event) => {
  event.preventDefault();

  if (!currentCouple || !currentUser) return;

  const button = event.currentTarget.querySelector(
    'button[type="submit"]'
  );
  const originalText = button.textContent;

  const title = $("memory-title").value.trim();
  const description = $("memory-description").value.trim();
  const memoryDate = $("memory-date").value || null;

  setButtonLoading(button, true, originalText);

  try {
    const { error } = await supabaseClient
  .from("memories")
  .insert({
    couple_id: currentCouple.id,
    uploader_id: currentUser.id,
    title,
    description,
    memory_date: memoryDate
  });

    if (error) throw error;

    $("memory-form").reset();
    showToast("A pillanat elmentve! ♡");
    await loadMemories();
  } catch (error) {
    handleError("Nem sikerült menteni:", error);
  } finally {
    setButtonLoading(button, false, originalText);
  }
});

async function loadMemories() {
  if (!currentCouple) return;

  const list = $("memories-list");
  list.innerHTML = '<p class="empty-state">Emlékek betöltése...</p>';

  const { data, error } = await supabaseClient
    .from("memories")
    .select("*")
    .eq("couple_id", currentCouple.id)
    .order("memory_date", { ascending: false, nullsFirst: false });

  if (error) {
    list.innerHTML =
      '<p class="empty-state">Az emlékek betöltése nem sikerült.</p>';
    handleError("Emlékbetöltési hiba:", error);
    return;
  }

  list.innerHTML = "";

  if (!data || data.length === 0) {
    list.innerHTML =
      '<p class="empty-state">Még nincs elmentett pillanatotok. ♡</p>';
    return;
  }

  data.forEach((memory) => {
    const item = document.createElement("div");
    item.className = "memory";

    const icon = document.createElement("div");
    icon.className = "memory-icon";
    icon.textContent = "♡";

    const content = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = memory.title || "Névtelen pillanat";

    const description = document.createElement("small");
    description.textContent = memory.description || "";

    const date = document.createElement("small");
    date.textContent = formatDate(memory.memory_date);

    content.append(title, description, date);
    item.append(icon, content);
    list.appendChild(item);
  });
}

// ========================================
// FOTÓALBUMOK
// ========================================

addListener("album-form", "submit", async (event) => {
  event.preventDefault();

  if (!currentCouple || !currentUser) return;

  const button = event.currentTarget.querySelector(
    'button[type="submit"]'
  );
  const originalText = button.textContent;
  const name = $("album-name").value.trim();

  if (!name) return;

  setButtonLoading(button, true, originalText);

  try {
    const { error } = await supabaseClient
      .from("photo_albums")
      .insert({
        couple_id: currentCouple.id,
        name,
        created_by: currentUser.id
      });

    if (error) throw error;

    $("album-form").reset();
    currentAlbumId = "";
    showToast("Album létrehozva! ♡");
    await loadAlbums();
  } catch (error) {
    handleError("Az album létrehozása nem sikerült:", error);
  } finally {
    setButtonLoading(button, false, originalText);
  }
});

addListener("album-select", "change", async (event) => {
  currentAlbumId = event.target.value;
  await loadPhotos();
});

async function loadAlbums() {
  if (!currentCouple) return;

  const select = $("album-select");

  const { data, error } = await supabaseClient
    .from("photo_albums")
    .select("id, name")
    .eq("couple_id", currentCouple.id)
    .order("created_at", { ascending: true });

  if (error) {
    handleError("Az albumok betöltése nem sikerült:", error);
    return;
  }

  select.innerHTML = '<option value="">Összes kép</option>';

  (data || []).forEach((album) => {
    const option = document.createElement("option");
    option.value = album.id;
    option.textContent = album.name;
    select.appendChild(option);
  });

  if (currentAlbumId && data.some(
    (album) => album.id === currentAlbumId
  )) {
    select.value = currentAlbumId;
  } else {
    currentAlbumId = "";
    select.value = "";
  }

  await loadPhotos();
}

// ========================================
// ALAPÉRTELMEZETT ALBUM
// ========================================

async function getOrCreateDefaultAlbum() {
  const { data: existing, error: findError } = await supabaseClient
    .from("photo_albums")
    .select("id")
    .eq("couple_id", currentCouple.id)
    .eq("name", "Közös képeink")
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing.id;

  const { data, error } = await supabaseClient
    .from("photo_albums")
    .insert({
      couple_id: currentCouple.id,
      name: "Közös képeink",
      created_by: currentUser.id
    })
    .select("id")
    .single();

  if (error) throw error;

  return data.id;
}

// ========================================
// FOTÓK FELTÖLTÉSE
// ========================================

addListener("photo-form", "submit", async (event) => {
  event.preventDefault();

  if (!currentCouple || !currentUser) return;

  const files = Array.from($("photo-input").files || []);

  if (!files.length) {
    showToast("Először válasszatok ki képeket.");
    return;
  }

  const button = event.currentTarget.querySelector(
    'button[type="submit"]'
  );
  const originalText = button.textContent;

  setButtonLoading(button, true, originalText);

  let uploadedCount = 0;

  try {
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        throw new Error("Csak képfájlokat lehet feltölteni.");
      }

      if (file.size > 10 * 1024 * 1024) {
        throw new Error(
          "Egy kép legfeljebb 10 MB lehet: " + file.name
        );
      }

      const extension = file.name.split(".").pop().toLowerCase();
      const safeExtension = /^[a-z0-9]+$/.test(extension)
        ? extension
        : "jpg";

      const filePath =
        `${currentCouple.id}/${currentUser.id}/${crypto.randomUUID()}.${safeExtension}`;

      const { error: uploadError } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;

      let albumId = currentAlbumId;

      if (!albumId) {
        albumId = await getOrCreateDefaultAlbum();
      }

      const { error: databaseError } = await supabaseClient
        .from("couple_photos")
        .insert({
          couple_id: currentCouple.id,
          album_id: albumId,
          uploaded_by: currentUser.id,
          image_path: filePath
        });

      if (databaseError) {
        await supabaseClient.storage
          .from(BUCKET_NAME)
          .remove([filePath]);

        throw databaseError;
      }

      uploadedCount++;
    }

    $("photo-form").reset();

    showToast(`${uploadedCount} kép sikeresen feltöltve! ♡`);
    await loadPhotos();

  } catch (error) {
    handleError("Feltöltési hiba:", error);
  } finally {
    setButtonLoading(button, false, originalText);
  }
});

// ========================================
// FOTÓK MEGJELENÍTÉSE
// ========================================

async function loadPhotos() {
  if (!currentCouple) return;

  const gallery = $("gallery");

  gallery.innerHTML =
    '<p class="empty-state">Képek betöltése...</p>';

  let query = supabaseClient
    .from("couple_photos")
    .select("id, album_id, image_path, created_at")
    .eq("couple_id", currentCouple.id)
    .order("created_at", { ascending: false });

  if (currentAlbumId) {
    query = query.eq("album_id", currentAlbumId);
  }

  const { data, error } = await query;

  if (error) {
    gallery.innerHTML =
      '<p class="empty-state">A képek betöltése nem sikerült.</p>';
    handleError("Képbetöltési hiba:", error);
    return;
  }

  gallery.innerHTML = "";

  $("gallery-count").textContent = `${data.length} kép`;
  $("gallery-title").textContent = currentAlbumId
    ? "Az album képei"
    : "Minden közös képünk";

  if (!data || data.length === 0) {
    gallery.innerHTML =
      '<p class="empty-state">Ebben az albumban még nincs kép. ♡</p>';
    return;
  }

  for (const photo of data) {
    const { data: signedData, error: signedError } =
      await supabaseClient.storage
        .from(BUCKET_NAME)
        .createSignedUrl(photo.image_path, 3600);

    if (signedError || !signedData?.signedUrl) {
      console.error("A kép URL-je nem kérhető le:", signedError);
      continue;
    }

    const item = document.createElement("div");
    item.className = "gallery-item";

    const image = document.createElement("img");
    image.src = signedData.signedUrl;
    image.alt = "Közös emlék";
    image.loading = "lazy";

    image.addEventListener("click", () => {
      window.open(
        signedData.signedUrl,
        "_blank",
        "noopener,noreferrer"
      );
    });

    const date = document.createElement("small");
    date.textContent = new Date(
      photo.created_at
    ).toLocaleDateString("hu-HU");

    item.append(image, date);
    gallery.appendChild(item);
  }

  if (!gallery.children.length) {
    gallery.innerHTML =
      '<p class="empty-state">Nem sikerült megjeleníteni a képeket.</p>';
  }
}

// ========================================
// BEJELENTKEZÉSI ÁLLAPOT
// ========================================

supabaseClient.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;

  setTimeout(async () => {
    if (currentUser) {
      await refreshApp();
    } else {
      currentCouple = null;
      coupleStartDate = null;
      currentAlbumId = "";

      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }

      showView("auth-view");
    }
  }, 0);
});

// ========================================
// INDÍTÁS
// ========================================

async function initializeApp() {
  showView("auth-view");

  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    currentUser = data.session?.user || null;

    if (currentUser) {
      await refreshApp();
    } else {
      showView("auth-view");
    }
  } catch (error) {
    handleError("Nem sikerült elindítani az alkalmazást:", error);
    showView("auth-view");
  }
}

initializeApp();
