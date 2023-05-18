require('dotenv').config();

const express = require('express');
const app = express();
const router = express.Router();
const excel = require('exceljs');
const fs = require('fs');
const moment = require('moment');
//const http = require('http');
const https = require('https');
const path = require('path');
const mysql = require('mysql');
const cron = require('node-cron');
const ejs = require('ejs');

//const HTTP_PORT = 80;
const HTTPS_PORT = 443;

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
  key: fs.readFileSync(process.env.KEY_PATH),
  cert: fs.readFileSync(process.env.CERT_PATH),
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
  const sql = `SELECT TRASHCAN_ID_PK, LOCATION_ADDR, LOCATION_LAT, LOCATION_LONG, TRASHCAN_LEVEL FROM location_tb INNER JOIN trashcan_tb ON location_tb.LOCATION_ID_PK = trashcan_tb.LOCATION_ID_FK`;
  connection.query(sql, function (err, result, fields) {
      if (err) throw err;
      res.send(result)
  });
});

// 파일 다운로드
app.get('/file_down', (req, res) => {
  res.render('file_down', { apiKey: process.env.KAKAO_MAPS_APPKEY });
});

// 적재량 업데이트
app.post('/data', (req, res) => {
  const distance = req.body.distance; // 거리 데이터 추출
  const trashcan_id = req.body.trashcan_id; // 쓰레기통 ID 추출
  console.log(`거리: ${distance}cm, 쓰레기통 ID: ${trashcan_id}`); // 추출한 데이터 출력

  // 현재 시간 (UTC+9 (한국 표준시) 적용)
  const now = new Date();
  const koreanNow = new Date(now.getTime() + (540 * 60 * 1000));
  const timeData = {
    year: koreanNow.getFullYear(),
    month: koreanNow.getMonth() + 1,
    date: koreanNow.getDate(),
    hours: koreanNow.getHours(),
    minutes: koreanNow.getMinutes(),
    seconds: koreanNow.getSeconds()
  };
  const formattedDate = `${timeData.year}-${('0' + timeData.month).slice(-2)}-${('0' + timeData.date).slice(-2)}`;
  const formattedTime = `${('0' + timeData.hours).slice(-2)}:${('0' + timeData.minutes).slice(-2)}:${('0' + timeData.seconds).slice(-2)}`;
  const dateTimeString = `${formattedDate} ${formattedTime}`;

  // TRASHCAN_LEVEL 값 업데이트
  const trashcanLength = 50; // 쓰레기통의 전체 길이
  let trashcan_level = Math.floor((1 - distance / trashcanLength) * 100); // distance를 %로 변환하여 TRASHCAN_LEVEL 계산
  trashcan_level = Math.max(0, trashcan_level); // 음수인 경우 0으로 설정

  const sql = `UPDATE trashcan_tb SET TRASHCAN_LEVEL = ${trashcan_level}, TRASHCAN_LAST_EMAIL = '${dateTimeString}' WHERE TRASHCAN_ID_PK = '${trashcan_id}'`;
  connection.query(sql, function (err, result, fields) {
    if (err) throw err;
    console.log(`TRASHCAN_ID_PK : ${trashcan_id}, TRASHCAN_LEVEL : ${trashcan_level}%, 현재 시간 : ${dateTimeString}`);
    if (trashcan_level >= 65) { // TRASHCAN_LEVEL이 65 이상인 경우 TRASHCAN_EXCEED_COUNT 값 증가
      const getExceedCountSql = `SELECT TRASHCAN_EXCEED_COUNT FROM trashcan_tb WHERE TRASHCAN_ID_PK = '${trashcan_id}'`;
      connection.query(getExceedCountSql, function (countErr, countResult, countFields) {
        if (countErr) throw countErr;
        const exceedCount = countResult[0].TRASHCAN_EXCEED_COUNT;

        if (exceedCount === 0) { // 첫 번째 값인 경우
          const updateExceedCountSql = `UPDATE trashcan_tb SET TRASHCAN_EXCEED_COUNT = 1 WHERE TRASHCAN_ID_PK = '${trashcan_id}'`;
          connection.query(updateExceedCountSql, function (updateErr, updateResult, updateFields) {
            if (updateErr) throw updateErr;
            console.log(`TRASHCAN_ID_PK : ${trashcan_id}, TRASHCAN_EXCEED_COUNT : 1`);
          });
        } else if (exceedCount === 1) { // 두 번째 값인 경우, 메일 전송 후 TRASHCAN_EXCEED_COUNT 값 초기화
          const updateExceedCountSql = `UPDATE trashcan_tb SET TRASHCAN_EXCEED_COUNT = 2 WHERE TRASHCAN_ID_PK = '${trashcan_id}'`;
          connection.query(updateExceedCountSql, function (updateErr, updateResult, updateFields) {
            if (updateErr) throw updateErr;
            console.log(`TRASHCAN_ID_PK : ${trashcan_id}, TRASHCAN_EXCEED_COUNT : 2`);
            const resetCountSql = `UPDATE trashcan_tb SET TRASHCAN_EXCEED_COUNT = 0 WHERE TRASHCAN_ID_PK = '${trashcan_id}'`; // 0으로 초기화
              connection.query(resetCountSql, function (resetErr, resetResult, resetFields) {
                if (resetErr) throw resetErr;
                console.log(`TRASHCAN_ID_PK : ${trashcan_id}, TRASHCAN_EXCEED_COUNT 값 초기화`);
              });

            const { exec } = require('child_process');
            exec(`node mail_full_http.js ${trashcan_id}`, (err, stdout, stderr) => {
              if (err) {
                console.error(err);
                return;
              }
              console.log(stdout);
            });
          });
        } else { // 1보다 큰 경우
          const resetCountSql = `UPDATE trashcan_tb SET TRASHCAN_EXCEED_COUNT = 0 WHERE TRASHCAN_ID_PK = '${trashcan_id}'`;
          connection.query(resetCountSql, function (resetErr, resetResult, resetFields) {
            if (resetErr) throw resetErr;
            console.log(`TRASHCAN_ID_PK : ${trashcan_id}, TRASHCAN_EXCEED_COUNT 값 초기화`);
          });
        }
      });
    } else if (trashcan_level < 65) { // TRASHCAN_LEVEL이 65 미만인 경우 TRASHCAN_EXCEED_COUNT 값 0으로 초기화
      const updateExceedCountSql = `UPDATE trashcan_tb SET TRASHCAN_EXCEED_COUNT = IF(TRASHCAN_EXCEED_COUNT = 1, 0, TRASHCAN_EXCEED_COUNT) WHERE TRASHCAN_ID_PK = '${trashcan_id}'`;
      connection.query(updateExceedCountSql, function (updateErr, updateResult, updateFields) {
        if (updateErr) throw updateErr;
        console.log(`TRASHCAN_ID_PK : ${trashcan_id}, TRASHCAN_EXCEED_COUNT 값 초기화`);
      });
    }
    res.send('업데이트 완료!');
  });
});

// LED 제어
let isNight = false; // isNight 값 초기화

const updateLEDStatus = () => {
  const now = new Date();
  const hour = now.getHours();
  
  // 현재 시간에 따라 isNight 값 업데이트
  if (hour >= 9 && hour < 21) { // UTC+9 (한국 표준시) 적용, 6시 이후부터 다음날 6시 이전까지는 밤
    isNight = true;
    console.log(`LED 켜짐`);
  } else { // 그 외는 낮
    isNight = false;
    console.log(`LED 꺼짐`);
  }
};

updateLEDStatus(); // 처음 실행시 즉시 업데이트

setInterval(updateLEDStatus, 3600000); // 이후 1시간마다 업데이트

app.get('/data', (req, res) => {
  console.log(isNight.toString());
  res.send(isNight.toString());
});

// 매일 오전 9시에 sendOldEmail 함수 실행
cron.schedule('0 0 * * *', () => {
  sendOldEmail();
});

// 관리가 필요한 쓰레기통 메일 보내기
function sendOldEmail() {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) { // UTC+9 (한국 표준시) 적용, 오전 9시 메일 발송
    const sql = `SELECT t.TRASHCAN_ID_PK, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_EMAIL FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK`;
    connection.query(sql, (error, results, fields) => {
      if (error) {
        console.error(error);
        return;
      }

      // 7일 이후인 데이터 필터링
      const now = new Date();
      const filteredResult = results.filter(item => {
        const lastEmail = new Date(item.TRASHCAN_LAST_EMAIL);
        const diffDays = Math.floor((now - lastEmail) / (1000 * 60 * 60 * 24));
        return diffDays >= 7;
      });

      // 중복된 이메일 필터링
      const uniqueEmails = [...new Set(filteredResult.map(item => item.ADMIN_EMAIL))];

      // TRASHCAN_ID_PK 값 저장
      const trashcanIds = filteredResult.map(item => item.TRASHCAN_ID_PK);

      const { exec } = require('child_process');
      exec(`node mail_old.js ${uniqueEmails.join(',')} ${trashcanIds.join(',')}`, (err, stdout, stderr) => {
        if (err) {
          console.error(err);
          return;
        }
        console.log(stdout);
      });
    });
  }
}

function createExcelWorksheet(workbook, filteredResult, condition, region) {
  // 엑셀 워크시트 생성
  let worksheetName;
  
  if (condition === 'A') {
    worksheetName = `원주시 쓰레기통 목록`;
  } else if (condition === 'B') {
    worksheetName = `${region} 쓰레기통 목록`;
  } else if (condition === 'C') {
    worksheetName = `포화 상태 쓰레기통 목록`;
  } else if (condition === 'D') {
    worksheetName = `${region} 포화 상태 쓰레기통 목록`;
  } else if (condition === 'E') {
    worksheetName = `1주일 이상 관리되지 않은 쓰레기통 목록`;
  } else if (condition === 'F') {
    worksheetName = `${region} 1주일 이상 관리되지 않은 쓰레기통 목록`;
  }
  
  const worksheet = workbook.addWorksheet(worksheetName);

  // 엑셀 헤더 작성
  worksheet.columns = [
    { header: '쓰레기통 아이디', key: 'TRASHCAN_ID_PK', width: 20},
    { header: '현재 적재량', key: 'TRASHCAN_LEVEL', width: 12},
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
    fileName = `원주시 쓰레기통.xlsx`;
  } else if (condition === 'B') {
    fileName = `${region} 쓰레기통.xlsx`;
  } else if (condition === 'C') {
    fileName = `포화 상태 쓰레기통.xlsx`;
  } else if (condition === 'D') {
    fileName = `${region} 포화 상태 쓰레기통.xlsx`;
  } else if (condition === 'E') {
    fileName = `1주일 이상 관리되지 않은 쓰레기통.xlsx`;
  } else if (condition === 'F') {
    fileName = `${region} 1주일 이상 관리되지 않은 쓰레기통.xlsx`;
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

// 원주시 전체
router.get('/file/list/all', (req, res) => {
  const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK`;
  connection.query(sql, function (err, result, fields) {
    if (err) throw err;

    // 엑셀 워크북 생성 및 파일 저장
    createExcelWorkbook(res, result, 'A');
  });
});

// 원주시 동별 전체
router.get('/file/list/:region', (req, res) => {
  let region = req.params.region;
  if (!region) {
    return res.status(400).send('Region parameter is missing.');
  }

  const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK WHERE a.ADMIN_RGN = ?`;
  connection.query(sql, [region], function (err, result, fields) {
    if (err) throw err;

    // 엑셀 워크북 생성
    const workbook = createExcelWorkbook(res, result, 'B', region);
  });
});

// 원주시 포화 상태
router.get('/file/full/all', (req, res) => {
  const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK`;
  connection.query(sql, function (err, result, fields) {
    if (err) throw err;

    // 80% 이상인 데이터 필터링
    const filteredResult = result.filter(item => item.TRASHCAN_LEVEL >= 80);

    // 엑셀 워크북 생성 및 파일 저장
    createExcelWorkbook(res, filteredResult, 'C');
  });
});

// 원주시 동별 포화 상태
router.get('/file/full/:region', (req, res) => {
  let region = req.params.region;
  if (!region) {
    return res.status(400).send('Region parameter is missing.');
  }

  const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK WHERE a.ADMIN_RGN = ?`;
  connection.query(sql, [region], function (err, result, fields) {
    if (err) throw err;

    // 80% 이상인 데이터 필터링
    const filteredResult = result.filter(item => item.TRASHCAN_LEVEL >= 80);

    // 엑셀 워크북 생성
    const workbook = createExcelWorkbook(res, filteredResult, 'D', region);
  });
});

// 원주시 1주일 이상
router.get('/file/old/all', (req, res) => {
  const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK`;
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
    createExcelWorkbook(res, filteredResult, 'E');
  });
});

// 원주시 동별 1주일 이상
router.get('/file/old/:region', (req, res) => {
  const region = req.params.region;
  const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK WHERE a.ADMIN_RGN = ?`;
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
    const workbook = createExcelWorkbook(res, filteredResult, 'F', region);
  });
});

/*
// HTTP
http.createServer(app).listen(HTTP_PORT, () => {
  console.log(`HTTP 서버가 ${HTTP_PORT} 포트에서 실행 중입니다.`);
});
*/

// HTTPS
https.createServer(options, app).listen(HTTPS_PORT, () => {
  console.log(`HTTPS 서버가 ${HTTPS_PORT} 포트에서 실행 중입니다.`);
});

app.use('/', router);

//app.listen(80);
