@echo off
rem ===========================================================================
rem tools\jobs\run-all.cmd -- thu ma Task Scheduler goi. KHONG goi node truc tiep.
rem ===========================================================================
rem
rem LUU Y VE CHU: file .cmd CO Y viet tieng Viet KHONG DAU. cmd.exe doc file bat
rem theo bang ma OEM chu khong phai UTF-8, nen dau tieng Viet bien thanh byte la
rem va co the lam vo ca cau lenh. Da vap that 01/08/2026: ban dau tien cua file
rem nay co dau, chay ra 9 dong "is not recognized as an internal or external
rem command". Loi giai thich day du bang tieng Viet co dau nam o tools/jobs/README.md
rem muc "Cam lich len may that".
rem
rem VI SAO FILE NAY TON TAI thay vi nhet cau lenh vao /TR cua schtasks:
rem   Mau cu trong README nhet ca chuoi DATABASE_URL vao tham so /TR. Chuoi do nam
rem   TRONG DINH NGHIA TAC VU: doc duoc bang "schtasks /Query /XML" va duoc luu
rem   thanh file XML duoi %WINDIR%\System32\Tasks. Tuc la mat khau co so du lieu
rem   cua tre em nam trong mot file khong ai canh, tren mot may da co 421 tac vu
rem   dang ky san (dem that tren may dev 01/08/2026). Vi pham dieu 8 va menh lenh 8.
rem   Nen: dinh nghia tac vu chi chua DUONG DAN TOI FILE NAY. Bi mat nam trong mot
rem   file env NGOAI kho, va quyen doc file do la thu Windows canh giup.
rem
rem Ba bien moi truong tuy chon, deu co mac dinh:
rem   HUB_ENV_FILE  file khai DATABASE_URL. Mac dinh C:\hub-secrets\hub.env
rem   HUB_NODE      duong dan tuyet doi toi node.exe. Mac dinh C:\Program Files\nodejs\node.exe
rem   HUB_LOG       file log. Mac dinh C:\ProgramData\hub\jobs.log  (NGOAI kho ma nguon)
rem
rem Ma thoat di thang tu run-all.mjs: 0 = xong, 1 = co job hong hoac thieu bo chay.
rem Task Scheduler hien con so do o cot "Last Run Result".

setlocal

if "%HUB_ENV_FILE%"=="" set "HUB_ENV_FILE=C:\hub-secrets\hub.env"

if not exist "%HUB_ENV_FILE%" (
  echo [%DATE% %TIME%] KHONG CO FILE ENV: "%HUB_ENV_FILE%" 1>&2
  echo   Tao file do NGOAI kho ma nguon, noi dung mot dong: 1>&2
  echo     DATABASE_URL=postgres://nguoi:matkhau@may:5432/hub 1>&2
  echo   Dat trong kho la de secret-scan tro thanh lop phong thu duy nhat. 1>&2
  exit /b 1
)

rem eol=# cho phep ghi chu trong file env. tokens=1,* tach o dau "=" DAU TIEN,
rem nen mat khau co chua dau "=" van nguyen ven.
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%HUB_ENV_FILE%") do (
  if not "%%A"=="" set "%%A=%%B"
)

if "%DATABASE_URL%"=="" (
  echo [%DATE% %TIME%] File env "%HUB_ENV_FILE%" khong khai DATABASE_URL. 1>&2
  exit /b 1
)

if "%HUB_NODE%"=="" set "HUB_NODE=C:\Program Files\nodejs\node.exe"
if not exist "%HUB_NODE%" (
  echo [%DATE% %TIME%] KHONG THAY NODE: "%HUB_NODE%" 1>&2
  echo   Khai HUB_NODE trong file env, tro toi node.exe dung tren may nay. 1>&2
  echo   Dung duong dan TUYET DOI, khong dua vao PATH: tac vu chay bang tai khoan 1>&2
  echo   SYSTEM co PATH khac han tai khoan nguoi dung da cai node. 1>&2
  exit /b 1
)

rem %~dp0 = thu muc chua chinh file nay, luon co dau \ o cuoi.
set "HUB_REPO=%~dp0..\.."

rem Log mac dinh nam NGOAI kho ma nguon. Ghi log vao trong kho la mot ngay nao do
rem co nguoi commit nham nhat ky van hanh len GitHub.
if "%HUB_LOG%"=="" set "HUB_LOG=C:\ProgramData\hub\jobs.log"
for %%F in ("%HUB_LOG%") do set "HUB_LOG_DIR=%%~dpF"
if not exist "%HUB_LOG_DIR%" mkdir "%HUB_LOG_DIR%" 2>nul

rem Mot dong phan cach truoc moi luot: doc log ma khong biet luot nao bat dau tu
rem dau la doc mot dong chu lien tuc.
echo. >> "%HUB_LOG%"
echo ===== %DATE% %TIME% ===== run-all.mjs %* >> "%HUB_LOG%"

pushd "%HUB_REPO%"
"%HUB_NODE%" "tools\jobs\run-all.mjs" %* >> "%HUB_LOG%" 2>&1
set "MA_THOAT=%ERRORLEVEL%"
popd

echo ===== ket thuc, ma thoat %MA_THOAT% ===== >> "%HUB_LOG%"
exit /b %MA_THOAT%
