require('dotenv').config();

const express = require('express');
const app = express();
const router = express.Router();
const excel = require('exceljs');
const fs = require('fs');
const moment = require('moment');
//const http = require('http');
//const https = require('https');
const path = require('path');
const mysql = require('mysql');
const cron = require('node-cron');
const ejs = require('ejs');

//const HTTP_PORT = 80;
//const HTTPS_PORT = 443;

const connection = mysql.createConnection({
  host     : process.env.DB_HOST,
  user     : process.env.DB_USER,
  password : process.env.DB_PASSWORD,
  database : process.env.DB_DATABASE,
  port : process.env.DB_PORT
});

connection.connect(function(err) {
    if(err) throw err;
    console.log('DB 연결');
});

let options = {
  extensions: ['ejs'],
  //key: fs.readFileSync(process.env.KEY_PATH),
  //cert: fs.readFileSync(process.env.CERT_PATH),
}

app.use(express.json()); // JSON 데이터 파싱
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', './views');
app.use('/static', express.static('static'));

app.get('/', function(req, res) {
  res.render('index', { apiKey: process.env.KAKAO_MAPS_APPKEY });
});

router.get('/map', (req, res) => {
  const sql = "SELECT TRASHCAN_ID_PK, LOCATION_ADDR, LOCATION_LAT, LOCATION_LONG, TRASHCAN_LEVEL FROM location_tb INNER JOIN trashcan_tb ON location_tb.LOCATION_ID_PK = trashcan_tb.LOCATION_ID_FK WHERE TRASHCAN_ID_PK IN ('heungeop_trash_05', 'heungeop_trash_15')"
  connection.query(sql, function (err, result, fields) {
      if (err) throw err;
      res.send(result)
  });
});

app.post('/distance', (req, res) => {
  const distance = req.body.distance; // 거리 데이터 추출
  const trashcan_id = req.body.trashcan_id; // 쓰레기통 ID 추출
  console.log(`거리: ${distance}m, 쓰레기통 ID: ${trashcan_id}`); // 추출한 데이터 출력

  // 현재 시간
  const now = new Date();
  const timeZoneOffset = now.getTimezoneOffset() / 60; // 분 단위로 나오므로 시간 단위로 변경
  const localHours = (now.getHours() + timeZoneOffset + 9) % 24; // UTC+9 (한국 표준시) 적용, 24시일 경우 0시로 변환
  const timeData = {
    year: now.getFullYear(),
    month: now.getMonth() + 1, // getMonth()는 0부터 시작하므로 1을 더함
    date: now.getDate(),
    hours: localHours,
    minutes: now.getMinutes(),
    seconds: now.getSeconds()
  };  
  const formattedDate = `${timeData.year}-${('0' + timeData.month).slice(-2)}-${('0' + timeData.date).slice(-2)}`;
  const formattedTime = `${('0' + timeData.hours).slice(-2)}:${('0' + timeData.minutes).slice(-2)}:${('0' + timeData.seconds).slice(-2)}`;
  const dateTimeString = `${formattedDate} ${formattedTime}`;

  // TRASHCAN_LEVEL 값 업데이트
  const trashcanLength = 135; // 쓰레기통의 전체 길이
  const trashcan_level = Math.floor((distance/trashcanLength) * 100); // distance를 %로 변환하여 TRASHCAN_LEVEL 계산
  const sql = `UPDATE trashcan_tb SET TRASHCAN_LEVEL = ${trashcan_level}, TRASHCAN_LAST_EMAIL = '${dateTimeString}' WHERE TRASHCAN_ID_PK = '${trashcan_id}'`;
  connection.query(sql, function (err, result, fields) {
    if (err) throw err;
    console.log(`TRASHCAN_ID_PK : ${trashcan_id}, TRASHCAN_LEVEL : ${trashcan_level}%, TRASHCAN_LAST_EMAIL : ${dateTimeString}`);
    if (trashcan_level >= 80) { // TRASHCAN_LEVEL이 80 이상인 경우 메일 보내기
      const { exec } = require('child_process');
      exec('node public/mail.js', (err, stdout, stderr) => {
        if (err) {
          console.error(err);
          return;
        }
        console.log(stdout);
      });
    }
    res.send('TRASHCAN_LEVEL과 TRASHCAN_LAST_EMAIL 업데이트 완료!');
  });
});

app.get('/time', (req, res) => {
  const fs = require('fs');
  const jsonData = JSON.parse(fs.readFileSync('time.json', 'utf8'));
  res.send(jsonData);
});

// 1시간마다 현재 시간을 time.json 파일에 저장
setInterval(() => {
  const now = new Date();
  const timeZoneOffset = now.getTimezoneOffset() / 60; // 분 단위로 나오므로 시간 단위로 변경
  const localHours = now.getHours() + timeZoneOffset + 9; // UTC+9 (한국 표준시) 적용
  const timeData = {
    hours: localHours,
  };

  fs.writeFile('time.json', JSON.stringify(timeData), (err) => {
    if (err) throw err;
    console.log('현재 시간을 time.json에 저장 완료');
  });
}, 3600000); // 1시간

function createExcelWorksheet(workbook, filteredResult, condition, region) {
  //엑셀 워크시트 생성
  let worksheetName;
  
  if (condition === 'A') {
    worksheetName = `포화 상태 쓰레기통 목록`;
  } else if (condition === 'B') {
    worksheetName = `${region} 포화 상태 쓰레기통 목록`;
  } else if (condition === 'C') {
    worksheetName = `1주일 이상 관리되지 않은 쓰레기통 목록`;
  } else {
    worksheetName = `${region} 1주일 이상 관리되지 않은 쓰레기통 목록`;
  }
  
  const worksheet = workbook.addWorksheet(worksheetName);

  // 엑셀 헤더 작성
  worksheet.columns = [
    { header: '쓰레기통 아이디', key: 'TRASHCAN_ID_PK', width: 20},
    { header: '현재 수용량', key: 'TRASHCAN_LEVEL', width: 12},
    { header: '마지막 이메일 전송 날짜', key: 'TRASHCAN_LAST_EMAIL', width: 22},
    { header: '주소', key: 'LOCATION_ADDR', width: 30},
    { header: '위도', key: 'LOCATION_LAT', width: 20},
    { header: '경도', key: 'LOCATION_LONG', width: 20},
    { header: '관리자 아이디', key: 'ADMIN_ID_PK', width: 15},
    { header: '관리자 행정구역', key: 'ADMIN_RGN', width: 15}
  ];

  // 엑셀 헤더 색상 변경
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'D9D9D9' },
    bgColor: { argb: 'D9D9D9' }
  };

  // 엑셀 왼쪽 정렬
  worksheet.columns.forEach(column => {
    column.alignment = { horizontal: 'left' };
  });

  // 엑셀 데이터 작성
  worksheet.addRows(filteredResult);
  return worksheet;
}

function createExcelWorkbook(res, filteredResult, condition, region) {
  // 엑셀 워크북 생성
  const workbook = new excel.Workbook();

  // 엑셀 워크시트 생성
  const worksheet = createExcelWorksheet(workbook, filteredResult, condition, region);

  // 엑셀 파일명 생성
  let fileName;
  if (condition === 'A') {
    fileName = "포화_상태_쓰레기통.xlsx";
  } else if (condition === 'B') {
    fileName = `${region}_포화_상태_쓰레기통.xlsx`;
  } else if (condition === 'C') {
    fileName = '1주일_이상_관리되지_않은_쓰레기통.xlsx';
  } else if (condition === 'D') {
    fileName = `${region}_1주일_이상_관리되지_않은_쓰레기통.xlsx`;
  }

  // 엑셀 파일 저장
  workbook.xlsx.writeFile(fileName)
    .then(function() {
      console.log(`${fileName} 파일 다운로드 완료`);
      const file = `${__dirname}/${fileName}`;
      res.download(file, function (err) {
        if (err) {
          console.log(`${fileName} 파일 다운로드 실패`, err);
        } else {
          fs.unlinkSync(file); // 파일 삭제
        }
      });
    })
    .catch(function(error) {
      console.log('오류 발생', error);
    });
}

router.get('/allfile', (req, res) => {
  const sql = "SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK";
  connection.query(sql, function (err, result, fields) {
    if (err) throw err;

    // 80% 이상인 데이터 필터링
    const filteredResult = result.filter(item => item.TRASHCAN_LEVEL >= 80);

    // 엑셀 워크북 생성 및 파일 저장
    createExcelWorkbook(res, filteredResult, 'A');
  });
});

router.get('/file/:region', (req, res) => {
  let region = req.params.region;
  if (!region) {
    return res.status(400).send('Region parameter is missing.');
  }

    const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN 
             FROM location_tb l 
             INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK 
             INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK 
             WHERE a.ADMIN_RGN = ? AND t.TRASHCAN_ID_PK IN ('heungeop_trash_05', 'heungeop_trash_15')`;
    connection.query(sql, [region], function (err, result, fields) {
    if (err) throw err;

    // 80% 이상인 데이터 필터링
    const filteredResult = result.filter(item => item.TRASHCAN_LEVEL >= 80);

    // 엑셀 워크북 생성
    const workbook = createExcelWorkbook(res, filteredResult, 'B', region);
  });
});

router.get('/file/old/all', (req, res) => {
  const sql = "SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK";
  connection.query(sql, function (err, result, fields) {
    if (err) throw err;

    // 7일 이후인 데이터 필터링
    const now = new Date();
    const filteredResult = result.filter(item => {
    const lastEmail = new Date(item.TRASHCAN_LAST_EMAIL);
    const diffDays = Math.floor((now - lastEmail) / (1000 * 60 * 60 * 24));
    return diffDays >= 7;
    });

    // 엑셀 워크북 생성 및 파일 저장
    createExcelWorkbook(res, filteredResult, 'C');
  });
});

router.get('/file/old/:region', (req, res) => {
  const region = req.params.region;
  const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN 
              FROM location_tb l 
              INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK 
              INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK 
              WHERE a.ADMIN_RGN = ? AND t.TRASHCAN_ID_PK IN ('heungeop_trash_05', 'heungeop_trash_15')`;
  connection.query(sql, [region], function (err, result, fields) {
    if (err) throw err;

    // 7일 이후인 데이터 필터링
    const now = new Date();
    const filteredResult = result.filter(item => {
    const lastEmail = new Date(item.TRASHCAN_LAST_EMAIL);
    const diffDays = Math.floor((now - lastEmail) / (1000 * 60 * 60 * 24));
    return diffDays >= 7;
    });

    // 엑셀 워크북 생성
    const workbook = createExcelWorkbook(res, filteredResult, 'D', region);
  });
});

/*
// HTTP
http.createServer(app).listen(HTTP_PORT, () => {
  console.log(`HTTP 서버가 ${HTTP_PORT} 포트에서 실행 중입니다.`);
});

// HTTPS
https.createServer(options, app).listen(HTTPS_PORT, () => {
  console.log(`HTTPS 서버가 ${HTTPS_PORT} 포트에서 실행 중입니다.`);
});
*/

app.use('/', router);

app.listen(80);
