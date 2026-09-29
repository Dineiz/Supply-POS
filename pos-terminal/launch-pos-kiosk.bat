@echo off
REM ============================================================
REM Dineiz Supply -- POS terminal launcher (silent thermal printing)
REM
REM A normal Chrome window always shows a print preview/dialog before
REM printing -- no webpage can skip that on its own, by design. Chrome's
REM --kiosk-printing flag is the standard way POS/kiosk web apps get
REM around this: it makes every window.print() call print immediately,
REM with no dialog, straight to the system's default printer using that
REM printer's default settings (paper size, margins, etc).
REM
REM IMPORTANT -- before using this, set the printer's DEFAULT paper size
REM in Windows: Settings > Bluetooth & devices > Printers & scanners >
REM your printer > Printer properties > Advanced > Printing Defaults >
REM Paper Size. Set it to 80 x 297mm (or whichever of your driver's
REM fixed sizes comfortably fits a full receipt -- 297mm was confirmed
REM to fit). --kiosk-printing always uses that default silently, with
REM no dialog to override it from, so this is what actually controls
REM paper size/no more accidental 3-sheet splits, not anything in Chrome.
REM
REM IMPORTANT -- --kiosk-printing only takes effect when Chrome starts a
REM brand new process. If a normal Chrome window is already running,
REM Windows just opens a new tab in *that* window and ignores every flag
REM below. The --user-data-dir here forces a separate, dedicated Chrome
REM profile so this always launches its own process regardless of what
REM else is open -- as a side benefit it also keeps this POS profile's
REM logins/history separate from whoever's day-to-day browsing profile.
REM
REM Edit POS_URL below to point at your real counter page once deployed
REM (see docs/10-deployment.md) -- localhost is only for local testing.
REM ============================================================

set POS_URL=http://localhost:3000/counter
set PROFILE_DIR=%LOCALAPPDATA%\Dineiz\pos-chrome-profile

set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME_PATH% set CHROME_PATH="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

REM --app=URL gives a clean, tab-less/address-bar-less window (looks like
REM a real POS app) while still having a normal title bar to minimize or
REM close. For a fully locked-down fullscreen terminal instead, replace
REM "--app=%POS_URL%" with "--kiosk %POS_URL%".
start "" %CHROME_PATH% --kiosk-printing --user-data-dir="%PROFILE_DIR%" --app=%POS_URL%
