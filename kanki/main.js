// Globals
var currentCardIndex = 0;
var correctAnswers = 0;
var incorrectAnswers = 0;
var deck = null;
var currentLevel = "all"; 
var fontLoaded = false;
var incorrectCardsQueue = []; 
var inErrorReviewMode = false;
var showingStarredOnly = false; 
var isReversedMode = false; 
var deviceScaleFactor = 1.0; // New variable for device scaling
var lastShowAnswerTime = 0; // Timestamp to prevent accidental button presses after showing answer
var starredCardsQueue = []; // Queue for starred cards review
var inStarredReviewMode = false; // Flag for starred review mode
var lastAnsweredCard = null; // most recently answered card (for "previous word" re-review)
var redoCard = null; // card currently being re-reviewed (previous word)

// Initialize configuration from vocabulary.js if available
function initializeConfig() {
  if (typeof KANKI_CONFIG !== 'undefined') {
    appLanguage = KANKI_CONFIG.language || appLanguage;
    appLevels = KANKI_CONFIG.levels || appLevels;
    log("Loaded custom configuration: " + appLanguage + " with levels: " + appLevels.join(", "));
  } else {
    log("Using default configuration");
  }
}

// The logging function
function log(logStuff) {
  var logElement = document.getElementById("log");
  if (logElement) {
    logElement.innerHTML += "<p>" + logStuff + "</p>";
  }
  console.log(logStuff);
}

function loadLanguageFont() {
  log("Loading " + appLanguage + " font...");
  
  // Force font loading early
  document.documentElement.style.fontFamily = "LanguageFont, sans-serif";
  
  // Wait for Kindle's slower processing
  setTimeout(function() {
    fontLoaded = true;
    log(appLanguage + " font loading completed");
    // Initial card display after font is loaded
    displayCurrentCard(false);
  }, 1000);
}

// Initialize fixed element heights to prevent layout shifts on e-ink display
function initializeFixedHeights() {
  log("Initializing fixed element heights for e-ink optimization...");
  
  var viewport = detectViewportAndAdjust();
  var cardContainer = document.getElementById("cardContainer");
  var controlButtons = document.getElementById("controlButtons");
  var intervalButtons = document.getElementById("intervalButtons");
  
  // Set dimensions based on screen size
  var cardHeight = "350px"; // was 300px - card bottom edge moved down
  var controlHeight = "100px"; // Reduced control height
  var intervalTop = "0px"; // Interval buttons appear at the top of the control section now
  var backMinHeight = "50px";
  var notesMinHeight = "20px";
  
  // Adjust dimensions based on detected viewport
  if (viewport.width >= 1800 || viewport.height >= 2400) {
    // Kindle Scribe (1860x2480): card fills most of the screen, notes area
    // gets an explicit height so the pager (outside the card) is never clipped.
    cardHeight = Math.round(viewport.height * 0.72) + "px";
    controlHeight = "auto"; // buttons size to content
    intervalTop = "0px";
    backMinHeight = "120px";
    notesMinHeight = "60px";
  } else if (viewport.width >= 1050 || viewport.height >= 1400) {
    // Large Kindles
    cardHeight = "600px"; // was 550px
    controlHeight = "120px"; // Reduced from 240px
    intervalTop = "0px";
    backMinHeight = "90px";
    notesMinHeight = "30px";
  } else if (viewport.width >= 750 || viewport.height >= 1000) {
    // Medium Kindles
    cardHeight = "450px"; // was 400px
    controlHeight = "100px"; // Reduced from 200px
    intervalTop = "0px";
    backMinHeight = "65px";
    notesMinHeight = "25px";
  }
  
  if (cardContainer) {
    cardContainer.style.height = cardHeight; 
    cardContainer.style.overflowY = "hidden"; // no scrollbar - notes are paged
    cardContainer.style.overflowX = "hidden";
  }
  
  // On Scribe, size the notes area explicitly: card minus top section minus
  // card padding. The pager lives outside the card, so it can never be hidden.
  if (viewport.width >= 1800 || viewport.height >= 2400) {
    sizeNotesArea(cardContainer);
  }
  
  if (controlButtons) {
    controlButtons.style.height = controlHeight; 
    controlButtons.style.overflow = "visible";
  }
  
  if (intervalButtons) {
    intervalButtons.style.display = "block";
    intervalButtons.style.visibility = "hidden";
    intervalButtons.style.top = intervalTop;
    var forceLayout = intervalButtons.offsetHeight;
  }
  
  var backElement = document.getElementById("cardBack");
  if (backElement) {
    backElement.style.minHeight = backMinHeight;
  }
  
  var notesElement = document.getElementById("cardNotes");
  if (notesElement) {
    notesElement.style.minHeight = notesMinHeight;
  }
  
  log("Fixed element heights initialized for viewport " + viewport.width + "x" + viewport.height);
}

// Size the notes area on Scribe: it takes the card height minus the top
// section (word/translation) minus the card padding, so the examples fill the
// card and the pager below (outside the card) is always visible.
function sizeNotesArea(cardContainer) {
  if (!cardContainer) return;
  var notesEl = document.getElementById("cardNotes");
  var topEl = document.getElementById("cardTop");
  if (!notesEl) return;
  
  var cardH = cardContainer.offsetHeight || cardContainer.clientHeight || 1500;
  var topH = topEl ? (topEl.offsetHeight || 0) : 0;
  // card padding (Scribe: top 14 + bottom 28 = 42) + notes margin-top (8)
  var notesH = Math.max(150, cardH - topH - 42 - 8);
  notesEl.style.height = notesH + "px";
  log("sizeNotesArea: card=" + cardH + " top=" + topH + " notes=" + notesH);
}

// Detect viewport size and adjust UI accordingly
function detectViewportAndAdjust() {
  var width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  var height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  
  log("Detected viewport size: " + width + "x" + height);
  
  // Add a CSS class to the body based on screen size range
  var body = document.body;
  
  // Remove existing size classes
  body.classList.remove('kindle-small', 'kindle-medium', 'kindle-large', 'kindle-xlarge');
  
  // Add appropriate class
  if (width <= 600) {
    body.classList.add('kindle-small');
  } else if (width <= 850) {
    body.classList.add('kindle-medium');
  } else if (width <= 1300) {
    body.classList.add('kindle-large');
  } else {
    body.classList.add('kindle-xlarge');
  }
  
  return { width: width, height: height };
}

// Handle window resize or orientation change events
function handleViewportChange() {
  // Debounce the resize event
  if (window.resizeTimer) {
    clearTimeout(window.resizeTimer);
  }
  
  window.resizeTimer = setTimeout(function() {
    log("Viewport changed, reinitializing and applying device scaling...");
    // Apply device-specific scaling first
    detectDeviceAndSetScaling();
    initializeFixedHeights();
    displayCurrentCard(false);
    // Update text display for responsive layout
    updateProgressDisplay();
    updateLevelDisplay();
    
    // Reposition any visible popups or toasts
    var toast = document.getElementById("toastNotification");
    if (toast && toast.style.display === "block") {
      var screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
      toast.style.top = (screenHeight > 1000) ? "120px" : "80px";
    }
    
    var overlay = document.getElementById("confirmationOverlay");
    if (overlay && overlay.style.display === "block") {
      var popup = overlay.querySelector(".popup");
      var screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
      var topPosition = Math.round(screenHeight / 2 - 100);
      popup.style.top = topPosition + "px";
    }
  }, 250);
}

// Add event listeners for window resize and orientation change
function addViewportListeners() {
  if (window.addEventListener) {
    window.addEventListener('resize', handleViewportChange, false);
    window.addEventListener('orientationchange', handleViewportChange, false);
    log("Added viewport change listeners");
  }
}

// Create flashcard deck data structure
function createDeck() {
  return {
    cards: [],
    lastStudied: new Date().getTime(),
    name: appLanguage + " Flashcards",
    mixed: true // levels are shuffled together in this deck
  };
}

function createCard(front, reading, back, notes, level, difficulty) {
  var displayText = front;
  if (reading) {
    displayText = front + ' <small>(' + reading + ')</small>';
  }
  
  return {
    id: (level || '') + '|' + front, // stable id for progress matching
    front: displayText,
    back: back,
    notes: notes || "",
    level: level || appLevels[0],
    difficulty: difficulty || 0,
    nextReview: new Date().getTime(),
    history: [],
    starred: false,
    timesViewed: 0,
    lastViewed: null
  };
}

// Default deck with words from vocabulary.js
function createDefaultDeck() {
  var deck = createDeck();
  
  if (typeof VOCABULARY !== 'undefined') {
    for (var level in VOCABULARY) {
      if (VOCABULARY.hasOwnProperty(level)) {
        for (var i = 0; i < VOCABULARY[level].length; i++) {
          var word = VOCABULARY[level][i];
          deck.cards.push(createCard(
            word.front, 
            word.reading,
            word.back, 
            word.notes, 
            level, 
            0
          ));
        }
      }
    }
    
    // Shuffle the whole deck so 必考词 / 基础词 / 超纲词 are mixed together
    shuffleArray(deck.cards);
    
    log("Created default deck with " + deck.cards.length + " cards (levels mixed)");
  } else {
    log("Warning: VOCABULARY not found, using minimal deck");
    deck.cards.push(createCard("Example", null, "Translation", "Sample card", appLevels[0], 0));
    deck.cards.push(createCard("Second", null, "Another translation", "Another sample", appLevels[0], 0));
  }
  
  return deck;
}

// Fisher-Yates shuffle (in place)
function shuffleArray(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// Save ONLY the progress (per-card study state) to localStorage.
// The full deck (front/back/notes) is recreated from the config file on load,
// which keeps the stored data tiny (the full deck JSON is ~8.7MB and would
// exceed the Kindle localStorage quota, silently breaking saves).
function saveDeck() {
  if (!deck) return;
  // Safety: if the vocabulary config failed to load (VOCABULARY undefined) we
  // fall back to a tiny deck (a couple of sample cards). Never overwrite the
  // real saved progress with that - wait until the full deck is available.
  if (!deck.cards || deck.cards.length < 100) {
    log("Save blocked: deck too small (" + (deck.cards ? deck.cards.length : 0) + " cards) - config may have failed to load");
    return;
  }
  try {
    var progress = {
      version: 2,
      lastStudied: deck.lastStudied,
      currentLevel: currentLevel,
      cards: {}
    };
    for (var i = 0; i < deck.cards.length; i++) {
      var c = deck.cards[i];
      progress.cards[c.id] = {
        d: c.difficulty,
        nr: c.nextReview,
        h: c.history,
        s: c.starred,
        tv: c.timesViewed,
        lv: c.lastViewed
      };
    }
    localStorage.setItem('kanki_deck', JSON.stringify(progress));
    log("Progress saved to localStorage");
  } catch (e) {
    log("Error saving progress: " + e.message);
  }
}

// Load deck: rebuild static cards from the config, then merge saved progress.
function loadDeck() {
  try {
    var saved = localStorage.getItem('kanki_deck');
    if (saved) {
      var progress = JSON.parse(saved);
      if (progress && progress.version === 2) {
        // If the config failed to load (VOCABULARY undefined), createDefaultDeck
        // would return a tiny sample deck. Keep the saved progress intact and
        // wait for a reload where the config loads correctly.
        if (typeof VOCABULARY === 'undefined') {
          log("Config not loaded yet - keeping saved progress, skipping deck build");
          deck = createDefaultDeck(); // sample deck for display only
          return true;
        }
        deck = createDefaultDeck();
        var map = progress.cards || {};
        for (var i = 0; i < deck.cards.length; i++) {
          var c = deck.cards[i];
          var p = map[c.id];
          if (p) {
            c.difficulty = p.d || 0;
            c.nextReview = p.nr || new Date().getTime();
            c.history = p.h || [];
            c.starred = !!p.s;
            c.timesViewed = p.tv || 0;
            c.lastViewed = p.lv || null;
          }
        }
        deck.lastStudied = progress.lastStudied || new Date().getTime();
        if (progress.currentLevel) currentLevel = progress.currentLevel;
        log("Loaded saved progress with " + deck.cards.length + " cards");
        return true;
      }
    }
  } catch (e) {
    log("Error loading deck: " + e.message);
  }
  
  // If no saved progress or error, create a new one
  deck = createDefaultDeck();
  log("Created new default deck");
  return false;
}

// Update status message for notifications (not confirmations)
function updateStatusMessage(message) {
  var statusElement = document.getElementById("statusMessage");
  if (!statusElement) return;
  
  statusElement.textContent = message;
  
  statusElement.style.display = "block";

  setTimeout(function() {
    statusElement.style.display = "none";
  }, 3000);
}

// Show confirmation popup
function showConfirmation(message, onConfirm) {
  var overlay = document.getElementById("confirmationOverlay");
  var popup = overlay.querySelector(".popup");
  var messageElement = document.getElementById("confirmationMessage");
  var yesButton = document.getElementById("confirmYesBtn");
  var noButton = document.getElementById("confirmNoBtn");
  
  // Set message
  messageElement.textContent = message;
  
  // Adjust popup position for different screen sizes
  var screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  var topPosition = Math.round(screenHeight / 2 - 100);  // Center vertically
  popup.style.top = topPosition + "px";
  
  // Set button handlers
  yesButton.onclick = function() {
    overlay.style.display = "none";
    if (onConfirm) onConfirm();
  };
  
  noButton.onclick = function() {
    overlay.style.display = "none";
  };
  
  // Show overlay
  overlay.style.display = "block";
}

// Spaced repetition algorithm (simplified SM-2)
function calculateNextReview(card, wasCorrect) {
  var now = new Date().getTime();
  
  // Record the review in history
  card.history.push({
    date: now,
    result: wasCorrect
  });
  
  if (wasCorrect) {
    // Increase the level if correct
    card.difficulty += 1;
    
    // Calculate next review based on difficulty
    var interval;
    switch (card.difficulty) {
      case 1:
        interval = 1 * 24 * 60 * 60 * 1000; // 1 day
        break;
      case 2:
        interval = 3 * 24 * 60 * 60 * 1000; // 3 days
        break;
      case 3:
        interval = 7 * 24 * 60 * 60 * 1000; // 1 week
        break;
      case 4:
        interval = 14 * 24 * 60 * 60 * 1000; // 2 weeks
        break;
      case 5:
        interval = 30 * 24 * 60 * 60 * 1000; // 1 month
        break;
      default:
        interval = 60 * 24 * 60 * 60 * 1000; // 2 months
        break;
    }
    
    card.nextReview = now + interval;
  } else {
    // If wrong, reset difficulty and review soon
    card.difficulty = 0;
    card.nextReview = now + (10 * 60 * 1000); // 10 minutes
  }
  
  saveDeck();
  
  return card;
}

// Function to set next review time based on difficulty
function setNextReviewTime(card, difficulty) {
  var now = new Date().getTime();
  
  // Record the review in history
  card.history.push({
    date: now,
    result: true,
    difficulty: difficulty
  });
  
  // Calculate interval based on difficulty
  var interval;
  switch (difficulty) {
    case 'again':
      interval = 10 * 60 * 1000; // 10 minutes
      card.difficulty = Math.max(0, card.difficulty - 1); // Decrease difficulty
      break;
    case 'hard':
      interval = 1 * 24 * 60 * 60 * 1000; // 1 day
      // Keep difficulty the same
      break;
    case 'good':
      interval = 3 * 24 * 60 * 60 * 1000; // 3 days
      card.difficulty += 1; // Increase difficulty
      break;
    case 'easy':
      interval = 7 * 24 * 60 * 60 * 1000; // 7 days
      card.difficulty += 2; // Increase difficulty more
      break;
    default:
      interval = 1 * 24 * 60 * 60 * 1000; // Default 1 day
  }
  
  // Apply a multiplier based on current difficulty level (longer intervals for higher difficulty)
  if (card.difficulty > 0) {
    interval = interval * (1 + (card.difficulty * 0.5));
  }
  
  // Set next review time
  card.nextReview = now + interval;
  
  return card;
}

// Get cards due for review (filtered by level if applicable).
// Scheduling rule: every 2 review cards, 1 new (never-studied) card is inserted,
// so new words are mixed into the review flow instead of waiting forever.
function getDueCards() {
  var now = new Date().getTime();
  var reviewCards = []; // studied cards whose nextReview has arrived
  var newCards = [];    // never-studied cards (no answer history yet)
  
  for (var i = 0; i < deck.cards.length; i++) {
    var card = deck.cards[i];
    // Apply both level and starred filters
    var levelMatch = (currentLevel === "all" || card.level === currentLevel);
    var starMatch = (!showingStarredOnly || card.starred === true);
    if (!levelMatch || !starMatch) continue;
    
    var isNew = (!card.history || card.history.length === 0);
    if (isNew) {
      newCards.push(card);
    } else if (card.nextReview <= now) {
      reviewCards.push(card);
    }
  }
  
  // Review priority: the most overdue cards come first (earliest nextReview first),
  // so the card that has been waiting longest is reviewed first.
  reviewCards.sort(function (a, b) {
    return a.nextReview - b.nextReview;
  });
  
  // Interleave: 2 review cards, then 1 new card, repeat.
  // Review cards always lead the queue; new cards are inserted in between.
  var dueCards = [];
  var ri = 0, ni = 0;
  while (ri < reviewCards.length || ni < newCards.length) {
    // 2 review cards (highest priority - most overdue first)
    for (var k = 0; k < 2 && ri < reviewCards.length; k++) {
      dueCards.push(reviewCards[ri++]);
    }
    // 1 new card
    if (ni < newCards.length) {
      dueCards.push(newCards[ni++]);
    }
  }
  
  return dueCards;
}

// Track the card currently shown, so queue changes don't skip or reorder cards.
var currentCardRef = null; // the card object currently displayed

// A rolling window of cards to study. preloadQueue[0] is the card currently
// being learned; [1] and [2] are preloaded ahead. After answering the current
// card we shift it out, preload the next one, and refill to keep the window
// at 3 cards (or fewer when the due deck runs out).
var preloadQueue = [];

// Fill preloadQueue up to PRELOAD_SIZE cards.
// Priority: 1) due review cards (most overdue first), 2) new cards.
// Constraint: the window always includes at least one unlearned (new) card
// while any remain - but review cards are preferred otherwise.
var PRELOAD_SIZE = 3;

function refillPreload() {
  if (!deck) return;
  var dueCards = getDueCards();
  var inQueue = {};
  for (var i = 0; i < preloadQueue.length; i++) inQueue[preloadQueue[i].id] = true;
  
  // Candidates not yet in the window
  var dueCandidates = [];
  for (var j = 0; j < dueCards.length; j++) {
    if (!inQueue[dueCards[j].id]) dueCandidates.push(dueCards[j]);
  }
  
  var isNew = function (c) { return !c.history || c.history.length === 0; };
  
  // Separate candidates into review (due) and new.
  var reviewCands = [], newCands = [];
  for (var c = 0; c < dueCandidates.length; c++) {
    if (isNew(dueCandidates[c])) newCands.push(dueCandidates[c]);
    else reviewCands.push(dueCandidates[c]);
  }
  // reviewCands are already most-overdue-first (getDueCards sorts them).
  
  var guard = 0;
  while (preloadQueue.length < PRELOAD_SIZE && (reviewCands.length > 0 || newCands.length > 0) && guard < PRELOAD_SIZE * 4) {
    guard++;
    var hasNew = preloadQueue.some(isNew);
    var remaining = PRELOAD_SIZE - preloadQueue.length;
    // If the window has no new card yet and new cards remain, reserve one slot
    // so the "guarantee a new word" rule holds even when review cards dominate.
    var reserveNew = (!hasNew && newCands.length > 0);
    var pick = null;

    // Preferred: a due REVIEW card (most overdue first), unless the remaining
    // slot must be saved for a new card.
    if (reviewCands.length > 0 && !(reserveNew && remaining <= 1)) {
      pick = reviewCands[0];
    } else if (reserveNew && newCands.length > 0) {
      pick = newCands[0];
    } else {
      break; // nothing we should add
    }
    
    preloadQueue.push(pick);
    inQueue[pick.id] = true;
    if (reviewCands.length > 0 && reviewCands[0].id === pick.id) {
      reviewCands.shift();
    } else {
      newCands = newCands.filter(function (x) { return x.id !== pick.id; });
    }
  }
}

// Regenerate the window from scratch (e.g. on first load / level switch).
function initPreload() {
  preloadQueue = [];
  refillPreload();
}

// Get the next card to show. Returns the card at the head of the preload
// window. The answer handler is responsible for shifting the answered card
// out and refilling (see advancePreload). For "previous word" redo, the card
// is shown directly.
function getNextCard() {
  // Ensure the window is populated (first display / after a refill)
  if (preloadQueue.length === 0) refillPreload();
  if (preloadQueue.length === 0) return null;
  return preloadQueue[0];
}

// After answering the current card (preloadQueue[0]), drop it and refill so a
// new card is ready for the next review.
function advancePreload() {
  preloadQueue.shift();
  refillPreload();
}

// Set the currently displayed card reference (called by display functions)
function setCurrentCardRef(card) {
  currentCardRef = card;
}

// Get starred cards that have been reviewed in the current session
function getStarredCardsFromCurrentSession() {
  var starredCards = [];
  
  for (var i = 0; i < deck.cards.length; i++) {
    var card = deck.cards[i];
    if (card.starred === true && card.timesViewed > 0) {
      // Apply level filter to starred cards too
      var levelMatch = (currentLevel === "all" || card.level === currentLevel);
      if (levelMatch) {
        starredCards.push(card);
      }
    }
  }
  
  return starredCards;
}

// Display current card - optimized to update DOM elements instead of recreating them
function displayCurrentCard(showAnswer) {
  var dueCards = getDueCards();
  
  // Get DOM elements once 
  var cardContainer = document.getElementById("cardContainer");
  var levelBadge = document.getElementById("levelBadge");
  var frontElement = document.getElementById("cardFront");
  var backElement = document.getElementById("cardBack");
  var notesElement = document.getElementById("cardNotes");
  var showAnswerBtn = document.getElementById("showAnswerBtn");
  var intervalButtons = document.getElementById("intervalButtons");
  var starButton = document.getElementById("starButton");
  
  // Hide answer elements by default
  backElement.style.display = "none";
  notesElement.style.display = "none";
  
  if (dueCards.length === 0) {
    cardContainer.style.display = "block";
    frontElement.innerHTML = "<div style='font-size: 0.7em; font-weight: normal; text-align: center; padding: 20px;'><p>No cards due for review!</p><p>Great job! </p></div>";
    levelBadge.style.display = "none";
    showAnswerBtn.style.display = "none";
    currentCardRef = null; // we're idle on "no cards" - allow auto-refresh

    intervalButtons.style.display = "block";
    intervalButtons.style.visibility = "hidden";
    starButton.style.display = "none"; 
    document.getElementById("cardStats").style.display = "none"; 
  
    if (incorrectCardsQueue.length > 0) {
      showErrorReviewPrompt();
    } else if (getStarredCardsFromCurrentSession().length > 0 && !inStarredReviewMode) {
      showStarredReviewPrompt();
    }
    
    updateProgressDisplay();
    return;
  }
  cardContainer.style.display = "block";
  document.getElementById("cardStats").style.display = "block"; // Show stats

  var card;
  if (showAnswer && dueCards.length > 0) {
    // "Show Answer" on the current card: keep showing the same card
    card = (currentCardRef && dueCards.indexOf(currentCardRef) >= 0) ? currentCardRef : dueCards[currentCardIndex % dueCards.length];
  } else {
    // If the preload window is empty (first display / after a level switch),
    // seed it now, then show the card at its head.
    if (preloadQueue.length === 0) {
      initPreload();
    }
    card = getNextCard();
    if (!card) {
      // No cards at all: fall back to the "done" state
      currentCardIndex = 0;
      card = dueCards[0];
    }
  }
  setCurrentCardRef(card);
  
  levelBadge.style.display = "block";
  levelBadge.textContent = card.level;
  
  if (isReversedMode) {
    frontElement.innerHTML = card.back;
    backElement.innerHTML = card.front;
  } else {
    frontElement.innerHTML = card.front;
    backElement.textContent = card.back;
  }
  
  applyWordBold(frontElement, backElement, isReversedMode);
  
  setupNotesPaging(card.notes || "");
  
  starButton.style.display = "block";
  updateStarButton(card.starred);

  if (!showAnswer) { 
    card.timesViewed = (card.timesViewed || 0) + 1;
    card.lastViewed = new Date().getTime();
    // Save view statistics
    saveDeck();
  }
  
  updateCardStats(card);
  
  // Check if card content is scrollable and update visual indicators
  updateScrollIndicators();
  
  if (showAnswer) {
    backElement.style.display = "block";
    notesElement.style.display = "block";
    showAnswerBtn.style.display = "none";
    intervalButtons.style.display = "block";
    intervalButtons.style.visibility = "visible";
    // Update scroll indicators after showing answer (content height may change)
    setTimeout(updateScrollIndicators, 100);
  } else {
    showAnswerBtn.style.display = "block";
    intervalButtons.style.display = "none"; // Hide completely instead of using visibility
  }
  
  updateProgressDisplay();
}

function updateProgressDisplay() {
  var progressElement = document.getElementById("progressDisplay");
  
  if (inErrorReviewMode) {
    progressElement.textContent = "⚠️ " + (currentCardIndex + 1) + 
      "/" + incorrectCardsQueue.length + " • ✓" + correctAnswers + 
      " • ✗" + incorrectAnswers;
    return;
  }
  
  if (inStarredReviewMode) {
    progressElement.textContent = "★ " + (currentCardIndex + 1) + 
      "/" + starredCardsQueue.length + " starred cards";
    return;
  }
  
  var dueCards = getDueCards();
  
  if (dueCards.length === 0) {
    progressElement.textContent = "✓ Done!";
    return;
  }
  
  progressElement.textContent = "Card :  " + (currentCardIndex % dueCards.length + 1) + 
      "/" + dueCards.length + " • ✓" + correctAnswers + 
      " • ✗" + incorrectAnswers;
  

  updateLevelDisplay();
}


function updateLevelDisplay() {
  var levelDisplayElement = document.getElementById("levelDisplay");
  var displayText = (currentLevel === "all" ? "All" : currentLevel);

  if (showingStarredOnly) {
    displayText += " ★";
  }
 
  displayText += " •" + (isReversedMode ? "Native→Target" : "Target→Native");
  
  levelDisplayElement.textContent = displayText;
}

// ---------------------------------------------------------------------------
// Notes paging: the notes area is filled page by page. Each page shows as many
// lines as fit, then turns to the next. Pages are measured on the real element
// with a safety margin, so the last line is never clipped.
// ---------------------------------------------------------------------------
var notesLines = [];       // lines of the current card's notes
var notesPages = [];       // arrays of line indices, one per page
var currentNotesPage = 0;  // index of the currently shown page

// (Re)load the pages for the current card and show the first page
function setupNotesPaging(notes) {
  var notesElement = document.getElementById("cardNotes");
  if (!notesElement) return;
  
  // Make sure the notes area has its explicit height
  sizeNotesArea(document.getElementById("cardContainer"));
  
  notesLines = (notes || "").split('\n');
  notesPages = buildNotesPages(notesLines);
  currentNotesPage = 0;
  renderNotesPage();
  
  // Kindle lays out asynchronously - re-measure after it settles so paging is
  // based on the real rendered size (never clips the last line).
  setTimeout(function() {
    sizeNotesArea(document.getElementById("cardContainer"));
    notesPages = buildNotesPages(notesLines);
    if (currentNotesPage >= notesPages.length) currentNotesPage = 0;
    renderNotesPage();
  }, 300);
}

// Fill pages by line count. We measure ONE line height with a hidden element,
// then split the lines into fixed chunks of "linesPerPage" lines. This never
// depends on scrollHeight (unreliable on Kindle overflow:hidden elements), so
// every page is guaranteed to fit - we leave 2 lines of margin so the last
// line is never clipped.
function buildNotesPages(lines) {
  var el = document.getElementById("cardNotes");
  if (!el || lines.length === 0) return [lines.slice()];
  
  var maxHeight = el.clientHeight;
  if (!maxHeight || maxHeight < 50) {
    var cardEl = document.getElementById("cardContainer");
    maxHeight = (cardEl ? cardEl.clientHeight : 900) - 300;
    if (maxHeight < 100) maxHeight = 400;
  }
  
  // Measure the height of one rendered line with a hidden measuring element
  // styled identically to .cardNotes (same font-size / line-height / width).
  var measurer = document.getElementById("notesMeasurer");
  if (!measurer) {
    measurer = document.createElement("div");
    measurer.id = "notesMeasurer";
    measurer.style.cssText = "position:absolute;visibility:hidden;left:-9999px;top:0;";
    document.body.appendChild(measurer);
  }
  measurer.style.width = (el.clientWidth || 600) + "px";
  measurer.style.fontSize = "1.2em";   // must match .cardNotes font-size
  measurer.style.lineHeight = "1.55";  // must match .cardNotes line-height
  measurer.style.whiteSpace = "pre-line";
  measurer.style.wordWrap = "break-word";
  measurer.textContent = "Ag";
  var lineH = measurer.offsetHeight || 20;
  
  // Content height minus padding-top (8px) and border-top (1px)
  var contentHeight = maxHeight - 9;
  // Lines per page, with a generous 5-line safety margin so the text never
  // touches the box edge (never clip the last line).
  var linesPerPage = Math.max(3, Math.floor(contentHeight / lineH) - 5);
  
  var pages = [];
  for (var i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) pages.push([]);
  
  return pages;
}

// Render the current notes page into #cardNotes, with a small page indicator.
// After filling the page we verify it fits inside the box (long lines may
// wrap into extra lines); if it overflows we drop trailing lines until it
// fits, so EVERY page - including after paging - keeps its safety margin.
function renderNotesPage() {
  var notesElement = document.getElementById("cardNotes");
  if (!notesElement) return;
  
  if (notesPages.length === 0) {
    notesElement.textContent = "";
    updatePagerButtons();
    return;
  }
  
  if (currentNotesPage < 0) currentNotesPage = 0;
  if (currentNotesPage >= notesPages.length) currentNotesPage = notesPages.length - 1;
  
  // Fill the page, then trim any lines that would overflow the box.
  var pageLines = notesPages[currentNotesPage].slice();
  notesElement.textContent = pageLines.join('\n');
  var maxH = notesElement.clientHeight || 0;
  try {
    while (pageLines.length > 1 && maxH > 0 && notesElement.scrollHeight > maxH) {
      pageLines.pop();
      notesElement.textContent = pageLines.join('\n');
    }
  } catch (e) { /* ignore */ }
  
  // Page indicator: "1/3"
  var indicator = document.getElementById("notesPageIndicator");
  if (indicator) {
    indicator.textContent = (currentNotesPage + 1) + "/" + notesPages.length;
  }
  
  updatePagerButtons();
}

// Enable/disable the ◀ ▶ pager buttons based on the current page
function updatePagerButtons() {
  var prevBtn = document.getElementById("notesPrevBtn");
  var nextBtn = document.getElementById("notesNextBtn");
  if (prevBtn) {
    prevBtn.disabled = (currentNotesPage <= 0);
  }
  if (nextBtn) {
    nextBtn.disabled = (currentNotesPage >= notesPages.length - 1);
  }
}

// Turn the notes page by delta (+1 next, -1 prev)
function turnNotesPage(delta) {
  if (notesPages.length <= 1) return;
  var next = currentNotesPage + delta;
  if (next < 0 || next >= notesPages.length) return; // stay within bounds
  currentNotesPage = next;
  renderNotesPage();
}

// Go back to the previous word (card) in the current mode.
// In normal mode: re-show the card that was just answered so the user can
// pick a different mastery level (Again/Hard/Good/Easy) and re-schedule it.
function goToPreviousCard() {
  if (inErrorReviewMode) {
    if (incorrectCardsQueue.length === 0) return;
    // step back to the nearest non-null (not-yet-answered) card in the error queue
    var idx = currentCardIndex;
    for (var step = 0; step < incorrectCardsQueue.length; step++) {
      idx = (currentCardIndex - 1 - step + incorrectCardsQueue.length) % incorrectCardsQueue.length;
      if (incorrectCardsQueue[idx] !== null) break;
    }
    currentCardIndex = idx;
    displayErrorCard(false);
    return;
  }
  if (inStarredReviewMode) {
    if (starredCardsQueue.length === 0) return;
    currentCardIndex = (currentCardIndex - 1 + starredCardsQueue.length) % starredCardsQueue.length;
    displayStarredCard(false);
    return;
  }
  // Normal mode: re-review the card we just answered (if any)
  if (lastAnsweredCard) {
    redoCard = lastAnsweredCard;
    displayRedoCard();
    return;
  }
  var dueCards = getDueCards();
  if (dueCards.length === 0) return;
  currentCardIndex = (currentCardIndex - 1 + dueCards.length) % dueCards.length;
  displayCurrentCard(false);
}

// Show the redo card with its answer already revealed so the user can pick
// a mastery level again. Reuses the same DOM update as displayCurrentCard(true).
function displayRedoCard() {
  if (!redoCard) return;
  
  var cardContainer = document.getElementById("cardContainer");
  var levelBadge = document.getElementById("levelBadge");
  var frontElement = document.getElementById("cardFront");
  var backElement = document.getElementById("cardBack");
  var notesElement = document.getElementById("cardNotes");
  var showAnswerBtn = document.getElementById("showAnswerBtn");
  var intervalButtons = document.getElementById("intervalButtons");
  var starButton = document.getElementById("starButton");
  
  // The card currently being re-reviewed IS the redo card, so when the user
  // answers it, getNextCard() positions correctly relative to it (fixes the
  // "after re-choosing, it comes back to the wrong word" bug).
  setCurrentCardRef(redoCard);
  
  cardContainer.style.display = "block";
  document.getElementById("cardStats").style.display = "block";
  
  levelBadge.style.display = "block";
  levelBadge.textContent = redoCard.level;
  
  if (isReversedMode) {
    frontElement.innerHTML = redoCard.back;
    backElement.innerHTML = redoCard.front;
  } else {
    frontElement.innerHTML = redoCard.front;
    backElement.textContent = redoCard.back;
  }
  
  applyWordBold(frontElement, backElement, isReversedMode);
  setupNotesPaging(redoCard.notes || "");
  
  starButton.style.display = "block";
  updateStarButton(redoCard.starred);
  
  updateCardStats(redoCard);
  updateScrollIndicators();
  
  // Reveal the answer and the interval buttons immediately
  backElement.style.display = "block";
  notesElement.style.display = "block";
  showAnswerBtn.style.display = "none";
  intervalButtons.style.display = "block";
  intervalButtons.style.visibility = "visible";
  setTimeout(updateScrollIndicators, 100);
  
  updateProgressDisplay();
}

// Ensure the word (front) is bold regardless of card direction.
// In normal mode the word is in .cardFront (already bold via CSS);
// in reversed mode it sits in .cardBack, so we bold it via JS.
function applyWordBold(frontElement, backElement, isReversed) {
  if (!frontElement || !backElement) return;
  if (isReversed) {
    backElement.style.fontWeight = "bold";
    frontElement.style.fontWeight = "normal";
  } else {
    frontElement.style.fontWeight = "bold";
    backElement.style.fontWeight = "normal";
  }
}

// Function to check if card content is scrollable and update visual indicators
// (kept for compatibility; the card no longer scrolls as a whole)
function updateScrollIndicators() {
  var cardContainer = document.getElementById("cardContainer");
  if (!cardContainer) return;
  cardContainer.classList.remove("scrollable-top");
  cardContainer.classList.remove("scrollable-bottom");
}

// Separate scroll handler function (kept for compatibility)
function scrollHandler() {
  var cardContainer = document.getElementById("cardContainer");
  if (!cardContainer) return;
  cardContainer.classList.remove("scrollable-top");
  cardContainer.classList.remove("scrollable-bottom");
}

// Function to handle keyboard navigation for card scrolling
function initializeCardKeyboardNavigation() {
  document.addEventListener('keydown', function(event) {
    var cardContainer = document.getElementById("cardContainer");
    var notesElement = document.getElementById("cardNotes");
    if (!cardContainer) return;
    
    // Only handle scroll keys when the card is the focused element or no specific element is focused
    var activeElement = document.activeElement;
    var isInputFocused = activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
    
    if (isInputFocused) return; // Don't interfere with input elements
    
    var scrollAmount = 150; // pixels per arrow key scroll (was 50 - too slow)
    var handled = false;
    
    switch(event.key) {
      case 'ArrowLeft':
      case 'PageUp':
        turnNotesPage(-1);
        handled = true;
        break;
      case 'ArrowRight':
      case 'PageDown':
        turnNotesPage(1);
        handled = true;
        break;
      case 'ArrowUp':
        // scroll the notes area up (examples are the scrollable region)
        notesElement.scrollBy(0, -scrollAmount);
        handled = true;
        break;
      case 'ArrowDown':
        notesElement.scrollBy(0, scrollAmount);
        handled = true;
        break;
      case 'Home':
        currentNotesPage = 0;
        renderNotesPage();
        handled = true;
        break;
      case 'End':
        currentNotesPage = notesPages.length - 1;
        renderNotesPage();
        handled = true;
        break;
    }
    
    if (handled) {
      event.preventDefault();
      updateScrollIndicators();
    }
  });
}


function showAnswer() {
  // Record timestamp to prevent accidental presses
  lastShowAnswerTime = Date.now();
  
  if (inErrorReviewMode) {
    displayErrorCard(true);
  } else if (inStarredReviewMode) {
    displayStarredCard(true);
  } else {
    displayCurrentCard(true);
  }
}

// Handle marking card as correct or incorrect
function answerCard(wasCorrect) {
  var dueCards = getDueCards();
  if (dueCards.length === 0) return;
  
  var cardIndex = currentCardIndex % dueCards.length;
  var card = dueCards[cardIndex];
  
  // Remember the card we just answered, for the "previous word" feature
  lastAnsweredCard = card;
  
  if (!wasCorrect) {
    var now = new Date().getTime();
    card.history.push({
      date: now,
      result: false
    });
    
    card.difficulty = 0;
    card.nextReview = now + (10 * 60 * 1000); // 10 minutes
    
    incorrectAnswers++;
    // No incorrectCardsQueue.push here - the 10-minute re-review is enough;
    // an immediate error-review popup would re-show this same word.
  }
  
  saveDeck();
  
  // Display the next card (getNextCard handles queue changes and skip prevention)
  displayCurrentCard(false);
}

// Handle answer with interval
function handleAnswerWithInterval(difficulty) {
  // Prevent accidental button presses within 500ms of showing answer
  if (Date.now() - lastShowAnswerTime < 500) {
    return;
  }
  
  // Re-review mode: the user went back to the previous word and picked a
  // mastery level again. Re-schedule that card and continue the flow.
  if (redoCard) {
    setNextReviewTime(redoCard, difficulty);
    lastAnsweredCard = redoCard;
    redoCard = null;
    // The redo card is rescheduled for later; pick up the next card from the
    // preload window. Reset currentCardRef so getNextCard() returns the actual
    // head of the window (the next card to study).
    currentCardRef = null;
    saveDeck();
    displayCurrentCard(false);
    return;
  }
  
  if (inErrorReviewMode) {
    answerErrorCardWithInterval(difficulty);
  } else if (inStarredReviewMode) {
    answerStarredCardWithInterval(difficulty);
  } else {
    // The card being answered is the current card (head of the preload window).
    var dueCards = getDueCards();
    if (dueCards.length === 0) return;
    
    // The "current card" is preloadQueue[0] if the window is seeded,
    // otherwise derive it from currentCardRef / the queue head.
    var currentCard = (preloadQueue.length > 0) ? preloadQueue[0] : currentCardRef;
    if (!currentCard && currentCardIndex >= 0 && dueCards.length > 0) {
      currentCard = dueCards[currentCardIndex % dueCards.length];
    }
    if (!currentCard) return;
    
    // Remember the card we just answered, for the "previous word" feature
    lastAnsweredCard = currentCard;

    if (difficulty === 'again') {
      incorrectAnswers++;
    } else {
      correctAnswers++;
    }

    setNextReviewTime(currentCard, difficulty);
    
    // The current card is now scheduled for later: drop it from the window
    // and preload the next one.
    advancePreload();
    
    saveDeck();
    
    // Display the next card (head of the refreshed preload window)
    displayCurrentCard(false);
  }
}

// Handle error card review with intervals
function answerErrorCardWithInterval(difficulty) {
  if (currentCardIndex >= incorrectCardsQueue.length) return;
  
  var card = incorrectCardsQueue[currentCardIndex];
  
  // Calculate next review time based on selected difficulty
  setNextReviewTime(card, difficulty);
  
  // Mark the card for removal from error queue
  incorrectCardsQueue[currentCardIndex] = null;
  
  // Move to next card
  currentCardIndex++;
  
  saveDeck();
  
  if (currentCardIndex >= incorrectCardsQueue.length) {
    endErrorReview();
  } else {
    displayErrorCard(false);
  }
}

// Handle interval-based answer for starred cards
function answerStarredCardWithInterval(difficulty) {
  if (currentCardIndex >= starredCardsQueue.length) return;
  
  var card = starredCardsQueue[currentCardIndex];
  
  // In starred review, we don't affect the regular spaced repetition schedule
  // This is just for practice, so we just move to the next card
  currentCardIndex++;
  
  saveDeck();
  
  if (currentCardIndex >= starredCardsQueue.length) {
    endStarredReview();
  } else {
    displayStarredCard(false);
  }
}

// Change the currently selected level
function changeLevel(level) {
  currentLevel = level;
  currentCardIndex = 0; // Reset counter when changing level
  currentCardRef = null; // start a fresh queue for the new level
  lastAnsweredCard = null; // previous-word tracking is per level session
  redoCard = null;
  updateLevelDisplay();
  displayCurrentCard(false);
  
  // Save user preference for level
  saveDeck();
}

// Initialize app on page load
function onPageLoad() {
  log("Application initializing...");

  initializeConfig();
  
  // Apply device-specific scaling before anything else
  detectDeviceAndSetScaling();

  loadLanguageFont();

  initializeFixedHeights();

  detectViewportAndAdjust();

  updateLevelButtons();

  addViewportListeners();

  if (!loadDeck()) {
    deck = createDefaultDeck();
    log("Created new default deck");
  }
  
  // Update menu button states
  var starredFilterBtn = document.getElementById("starredFilterBtn");
  var reverseToggleBtn = document.getElementById("reverseToggleBtn");
  
  if (starredFilterBtn && showingStarredOnly) {
    starredFilterBtn.classList.add("active");
  }
  
  if (reverseToggleBtn && isReversedMode) {
    reverseToggleBtn.classList.add("active");
  }

  updateProgressDisplay();
  
  // Initialize scroll indicators after a short delay to ensure DOM is ready
  setTimeout(function() {
    updateScrollIndicators();
  }, 200);
  
  // Initialize keyboard navigation for card scrolling
  initializeCardKeyboardNavigation();
  
  // Periodically check whether new cards have become due (e.g. a card answered
  // "Again" 10 minutes ago). If the current screen is idle on the "no cards"
  // state, refresh it so the newly due cards appear automatically.
  setInterval(checkForDueCards, 60 * 1000); // check once per minute
  
  // Refresh immediately when the screen wakes up / app comes back to foreground.
  // Kindle fires visibilitychange when the display turns on or the app regains
  // focus; pageshow/focus are fallbacks for older WebKit builds.
  if (document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        log("Screen visible - refreshing due cards");
        checkForDueCards();
      }
    });
    document.addEventListener('pageshow', checkForDueCards);
    window.addEventListener('focus', checkForDueCards);
  }
  
  log("Application initialized");
}

// Recompute the due queue and refresh the display if new cards have arrived.
// Used by the periodic timer and by the screen-wake listeners.
function checkForDueCards() {
  if (inErrorReviewMode || inStarredReviewMode) return;
  if (!deck) return;
  var dueCards = getDueCards();
  if (dueCards.length === 0) return;
  var frontEl = document.getElementById("cardFront");
  var showingDone = frontEl && frontEl.innerHTML.indexOf("No cards due") >= 0;
  // Only auto-refresh when we're genuinely idle on the "done" screen.
  // Never reset currentCardRef otherwise - doing so would jump back to the
  // first card of the session (e.g. a card the user already answered Easy).
  if (showingDone && currentCardRef === null) {
    currentCardIndex = 0;
    displayCurrentCard(false);
    updateProgressDisplay();
  }
}

// Update level buttons dynamically based on appLevels
function updateLevelButtons() {
  var levelsContainer = document.getElementById("levelButtons");
  if (!levelsContainer) return;
  
  while (levelsContainer.children.length > 1) {
    levelsContainer.removeChild(levelsContainer.lastChild);
  }
  
  for (var i = 0; i < appLevels.length; i++) {
    var button = document.createElement("button");
    button.textContent = appLevels[i];
    button.onclick = createLevelChangeHandler(appLevels[i]);
    levelsContainer.appendChild(button);
  }
  
  var lineBreak = document.createElement("br");
  levelsContainer.appendChild(lineBreak);
  
  // These buttons are now in the HTML directly
}

function createLevelChangeHandler(level) {
  return function() {
    changeLevel(level);
  };
}

function showResetProgressConfirm() {
  showConfirmation("Are you sure you want to reset all cards' progress?", resetProgress);
}

function showResetAllConfirm() {
  showConfirmation("Are you sure you want to reset all data? This will delete all cards and progress.", resetAll);
}

function showToast(message, duration) {
  var toast = document.getElementById("toastNotification");
  if (!toast) return;
  
  toast.textContent = message;
  
  // Adjust toast position for larger screens
  var screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  toast.style.top = (screenHeight > 1000) ? "120px" : "80px";
  
  toast.style.display = "block";
  
  setTimeout(function() {
    toast.style.display = "none";
  }, duration || 2000);
}

// Reset progress
function resetProgress() {
  for (var i = 0; i < deck.cards.length; i++) {
    deck.cards[i].difficulty = 0;
    deck.cards[i].nextReview = new Date().getTime();
    deck.cards[i].history = [];
  }
  
  currentCardIndex = 0;
  correctAnswers = 0;
  incorrectAnswers = 0;
  incorrectCardsQueue = []; 
  inErrorReviewMode = false;
  starredCardsQueue = [];
  inStarredReviewMode = false;
  lastAnsweredCard = null;
  redoCard = null;
  
  // Hide status message if visible
  var statusElement = document.getElementById("statusMessage");
  statusElement.style.display = "none";
  
  displayCurrentCard(false);
  saveDeck();
  showToast("Progress has been reset", 2000);
  log("Progress reset");
}

// Reset all
function resetAll() {
  deck = createDefaultDeck();
  currentCardIndex = 0;
  correctAnswers = 0;
  incorrectAnswers = 0;
  incorrectCardsQueue = [];
  inErrorReviewMode = false;
  showingStarredOnly = false; 
  isReversedMode = false;
  starredCardsQueue = [];
  inStarredReviewMode = false;
  lastAnsweredCard = null;
  redoCard = null;
  
  // Hide status message if visible
  var statusElement = document.getElementById("statusMessage");
  statusElement.style.display = "none";
  
  displayCurrentCard(false);
  saveDeck();
  showToast("All data has been reset", 2000);
  log("Complete reset performed");
}

// Show prompt to review errors
function showErrorReviewPrompt() {
  showConfirmation(
    "You have " + incorrectCardsQueue.length + " incorrect cards. Review them now?", 
    startErrorReview
  );
}

// Show prompt to review starred cards
function showStarredReviewPrompt() {
  var starredCount = getStarredCardsFromCurrentSession().length;
  showConfirmation(
    "You have " + starredCount + " starred cards from this session. Review them now?", 
    startStarredReview
  );
}

// Start error review mode
function startErrorReview() {
  if (incorrectCardsQueue.length === 0) return;
  
  inErrorReviewMode = true;
  showToast("Reviewing incorrect cards", 2000);
  
  var statusElement = document.getElementById("statusMessage");
  statusElement.textContent = "Error Review Mode";
  statusElement.style.display = "block";
  
  currentCardIndex = 0;
  lastViewedCardId = null; // Reset view tracking when starting error review
  displayErrorCard(false);
}

// Display error card
function displayErrorCard(showAnswer) {
  var cardContainer = document.getElementById("cardContainer");
  var levelBadge = document.getElementById("levelBadge");
  var frontElement = document.getElementById("cardFront");
  var backElement = document.getElementById("cardBack");
  var notesElement = document.getElementById("cardNotes");
  var showAnswerBtn = document.getElementById("showAnswerBtn");
  var intervalButtons = document.getElementById("intervalButtons");
  var starButton = document.getElementById("starButton");

  backElement.style.display = "none";
  notesElement.style.display = "none";
  
  if (currentCardIndex >= incorrectCardsQueue.length) {
    endErrorReview();
    return;
  }
  
  cardContainer.style.display = "block";
  document.getElementById("cardStats").style.display = "block"; // Show stats
  
  var card = incorrectCardsQueue[currentCardIndex];
  
  levelBadge.style.display = "block";
  levelBadge.textContent = card.level;

  if (isReversedMode) {
    frontElement.innerHTML = card.back;
    backElement.innerHTML = card.front;
  } else {
    frontElement.innerHTML = card.front;
    backElement.textContent = card.back;
  }
  
  applyWordBold(frontElement, backElement, isReversedMode);
  
  setupNotesPaging(card.notes || "");
  
  starButton.style.display = "block";
  updateStarButton(card.starred);
  
  if (!showAnswer) { 
    card.timesViewed = (card.timesViewed || 0) + 1;
    card.lastViewed = new Date().getTime();
  }
  
  updateCardStats(card);
  
  if (showAnswer) {
    backElement.style.display = "block";
    notesElement.style.display = "block";
    showAnswerBtn.style.display = "none";
    intervalButtons.style.display = "block";
    intervalButtons.style.visibility = "visible";
  } else {
    showAnswerBtn.style.display = "block";
    intervalButtons.style.display = "none"; // Hide completely instead of using visibility
  }
  
  updateProgressDisplay();
}

function answerErrorCard(wasCorrect) {
  if (currentCardIndex >= incorrectCardsQueue.length) return;
  
  var card = incorrectCardsQueue[currentCardIndex];

  if (!wasCorrect) {
    currentCardIndex++;
    
    if (currentCardIndex >= incorrectCardsQueue.length) {
      endErrorReview();
    } else {
      displayErrorCard(false);
    }
  }
}

function answerStarredCard(wasCorrect) {
  if (currentCardIndex >= starredCardsQueue.length) return;
  
  var card = starredCardsQueue[currentCardIndex];
  
  // Always move to the next card in starred review (just for practice)
  currentCardIndex++;
  
  if (currentCardIndex >= starredCardsQueue.length) {
    endStarredReview();
  } else {
    displayStarredCard(false);
  }
}

function endErrorReview() {
  incorrectCardsQueue = incorrectCardsQueue.filter(function(card) {
    return card !== null;
  });
  
  inErrorReviewMode = false;
  
  var statusElement = document.getElementById("statusMessage");
  statusElement.style.display = "none";

  if (incorrectCardsQueue.length > 0) {
    showConfirmation(
      "You still have " + incorrectCardsQueue.length + " cards to master. Review them again?",
      startErrorReview
    );
  } else {
    showToast("All error cards reviewed successfully!", 2000);
    // After error review is complete, check for starred cards
    if (getStarredCardsFromCurrentSession().length > 0 && !inStarredReviewMode) {
      showStarredReviewPrompt();
    } else {
      currentCardIndex = 0;
      displayCurrentCard(false);
    }
  }
  saveDeck();
}

// Start starred cards review mode
function startStarredReview() {
  starredCardsQueue = getStarredCardsFromCurrentSession();
  if (starredCardsQueue.length === 0) return;
  
  // Store previous filter state to restore after starred review
  var previouslyShowingStarredOnly = showingStarredOnly;
  
  inStarredReviewMode = true;
  showToast("Reviewing starred cards", 2000);
  
  var statusElement = document.getElementById("statusMessage");
  statusElement.textContent = "Starred Cards Review";
  statusElement.style.display = "block";
  
  currentCardIndex = 0;
  lastViewedCardId = null; // Reset view tracking when starting starred review
  displayStarredCard(false);
}

// Display starred card
function displayStarredCard(showAnswer) {
  var cardContainer = document.getElementById("cardContainer");
  var levelBadge = document.getElementById("levelBadge");
  var frontElement = document.getElementById("cardFront");
  var backElement = document.getElementById("cardBack");
  var notesElement = document.getElementById("cardNotes");
  var showAnswerBtn = document.getElementById("showAnswerBtn");
  var intervalButtons = document.getElementById("intervalButtons");
  var starButton = document.getElementById("starButton");

  backElement.style.display = "none";
  notesElement.style.display = "none";
  
  if (currentCardIndex >= starredCardsQueue.length) {
    endStarredReview();
    return;
  }
  
  cardContainer.style.display = "block";
  document.getElementById("cardStats").style.display = "block"; // Show stats

  var card = starredCardsQueue[currentCardIndex];
  
  levelBadge.style.display = "block";
  levelBadge.textContent = card.level;
  
  if (isReversedMode) {
    frontElement.innerHTML = card.back;
    backElement.innerHTML = card.front;
  } else {
    frontElement.innerHTML = card.front;
    backElement.textContent = card.back;
  }
  
  applyWordBold(frontElement, backElement, isReversedMode);
  
  setupNotesPaging(card.notes || "");
  
  starButton.style.display = "block";
  updateStarButton(card.starred);

  if (!showAnswer) {
    // Update view statistics for starred review
    card.timesViewed = (card.timesViewed || 0) + 1;
    card.lastViewed = new Date().getTime();
  }
  
  updateCardStats(card);
  updateScrollIndicators();
  
  if (showAnswer) {
    backElement.style.display = "block";
    notesElement.style.display = "block";
    showAnswerBtn.style.display = "none";
    intervalButtons.style.display = "block";
    intervalButtons.style.visibility = "visible";
    setTimeout(updateScrollIndicators, 100);
  } else {
    showAnswerBtn.style.display = "block";
    intervalButtons.style.display = "none";
  }
  
  updateProgressDisplay();
}

function endStarredReview() {
  inStarredReviewMode = false;
  starredCardsQueue = [];
  
  var statusElement = document.getElementById("statusMessage");
  statusElement.style.display = "none";
  
  showToast("Starred cards review completed!", 2000);
  
  // IMPORTANT: Reset the starred filter to ensure regular cards are shown after review
  showingStarredOnly = false;
  var starredFilterBtn = document.getElementById("starredFilterBtn");
  if (starredFilterBtn) {
    starredFilterBtn.classList.remove("active");
  }
  
  // Reset the card index and refresh the display
  currentCardIndex = 0;
  updateLevelDisplay(); // Update the level display to reflect the filter change
  displayCurrentCard(false);
  saveDeck();
}

function handleAnswerCard(wasCorrect) {
  if (inErrorReviewMode) {
    answerErrorCard(wasCorrect);
  } else if (inStarredReviewMode) {
    answerStarredCard(wasCorrect);
  } else {
    if (!wasCorrect) {
      answerCard(wasCorrect);
    }
    saveDeck();
  }
}

function toggleStarCurrentCard() {
  var card = null;
  
  if (inStarredReviewMode) {
    if (currentCardIndex >= starredCardsQueue.length) return;
    card = starredCardsQueue[currentCardIndex];
  } else if (inErrorReviewMode) {
    if (currentCardIndex >= incorrectCardsQueue.length) return;
    card = incorrectCardsQueue[currentCardIndex];
  } else {
    var dueCards = getDueCards();
    if (dueCards.length === 0) return;
    var cardIndex = currentCardIndex % dueCards.length;
    card = dueCards[cardIndex];
  }
  
  if (!card) return;
  
  card.starred = !card.starred;
  
  updateStarButton(card.starred);
  
  saveDeck();
  showToast(card.starred ? "Card starred" : "Card unstarred", 1000);
}

function updateStarButton(isStarred) {
  var starButton = document.getElementById("starButton");
  if (!starButton) return;
  
  if (isStarred) {
    starButton.innerHTML = "★";
    starButton.classList.add("starred");
  } else {
    starButton.innerHTML = "☆";
    starButton.classList.remove("starred");
  }
}

// Toggle showing only starred cards
function toggleStarredFilter() {
  showingStarredOnly = !showingStarredOnly;
  currentCardIndex = 0; 
  var starredFilterBtn = document.getElementById("starredFilterBtn");
  if (starredFilterBtn) {
    if (showingStarredOnly) {
      starredFilterBtn.classList.add("active");
    } else {
      starredFilterBtn.classList.remove("active");
    }
  }
  
  updateLevelDisplay();
  displayCurrentCard(false);
  
  // Save user preference for starred filter
  saveDeck();
}

function toggleCardDirection() {
  isReversedMode = !isReversedMode;
  currentCardIndex = 0; 
  var reverseToggleBtn = document.getElementById("reverseToggleBtn");
  if (reverseToggleBtn) {
    if (isReversedMode) {
      reverseToggleBtn.classList.add("active");
    } else {
      reverseToggleBtn.classList.remove("active");
    }
  }
  
  updateDirectionDisplay();
  
  displayCurrentCard(false);
  
  // Save user preference for card direction
  saveDeck();
  
  showToast(isReversedMode ? "Flip: Native → Target" : "Flip: Target → Native", 1500);
}

function updateDirectionDisplay() {
  var levelDisplayElement = document.getElementById("levelDisplay");
  var levelText = "Level: " + (currentLevel === "all" ? "All Levels" : currentLevel);
  
  if (showingStarredOnly) {
    levelText += " (Starred Only)";
  }
  
  levelText += " • " + (isReversedMode ? "Native → Target" : "Target → Native");
  
  levelDisplayElement.textContent = levelText;
}

function updateCardStats(card) {
  var statsElement = document.getElementById("cardStats");
  if (!statsElement || !card) return;
  
  var totalViews = card.timesViewed || 0;
  var correctAnswers = 0;
  var incorrectAnswers = 0;
  var lastViewed = card.lastViewed ? new Date(card.lastViewed) : null;
  
  if (card.history && card.history.length > 0) {
    for (var i = 0; i < card.history.length; i++) {
      if (card.history[i].result === true) {
        correctAnswers++;
      } else {
        incorrectAnswers++;
      }
    }
  }

  var lastViewedText = "never";
  if (lastViewed) {
    var now = new Date();
    var diffMs = now - lastViewed;
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    var diffHours = Math.floor(diffMs / (1000 * 60 * 60)) % 24;
    var diffMins = Math.floor(diffMs / (1000 * 60)) % 60;
    
    if (diffDays > 0) {
      lastViewedText = diffDays + " day" + (diffDays !== 1 ? "s" : "") + " ago";
    } else if (diffHours > 0) {
      lastViewedText = diffHours + " hour" + (diffHours !== 1 ? "s" : "") + " ago";
    } else if (diffMins > 0) {
      lastViewedText = diffMins + " minute" + (diffMins !== 1 ? "s" : "") + " ago";
    } else {
      lastViewedText = "just now";
    }
  }
  
  statsElement.innerHTML = "Viewed " + totalViews + " time" + (totalViews !== 1 ? "s" : "") + 
    " • Last: " + lastViewedText;
}

// Detect device and set appropriate scaling
function detectDeviceAndSetScaling() {
  var width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  var height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  
  log("Device resolution detected: " + width + "x" + height);
  
  // Base scale is for 600x800 (original Kindle)
  deviceScaleFactor = 1.0;
  
  // Specific handling for Kindle Paperwhite 3 (1072×1448)
  if ((width >= 1070 && width <= 1080) && (height >= 1440 && height <= 1460)) {
    deviceScaleFactor = 0.6; // Special scaling for Paperwhite 3
    log("Kindle Paperwhite 3 detected. Applied special scaling: " + deviceScaleFactor);
  }
  // High DPI Kindle devices (like Oasis, Scribe)
  else if (width >= 1000 && height >= 1400) {
    deviceScaleFactor = 0.65; // Reduce the scaling factor for high-res screens
    log("High-res device detected. Applied scaling: " + deviceScaleFactor);
  }
  // Mid-size Kindle screens
  else if ((width >= 750 && width < 1000) || (height >= 1000 && height < 1400)) {
    deviceScaleFactor = 0.8;
    log("Mid-size device detected. Applied scaling: " + deviceScaleFactor);
  }
  
  // Apply scaling to the root element
  document.documentElement.style.fontSize = (deviceScaleFactor * 100) + "%";
  
  // Set a CSS variable that can be used in CSS files
  document.documentElement.style.setProperty('--device-scale', deviceScaleFactor);
  
  // Add a special class for specific device types
  var body = document.body;
  body.classList.remove('kindle-base', 'kindle-paperwhite', 'kindle-oasis');
  
  if ((width >= 1070 && width <= 1080) && (height >= 1440 && height <= 1460)) {
    body.classList.add('kindle-paperwhite');
  } else if (width >= 1200) {
    body.classList.add('kindle-oasis');
  } else {
    body.classList.add('kindle-base');
  }
}

