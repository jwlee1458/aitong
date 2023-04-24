const express = require('express');
const app = express();
const router = express.Router();
const excel = require('exceljs');
const fs = require('fs');
const moment = require('moment');

const mysql = require('mysql');

const connection = mysql.createConnection({
  host     : "database-1.cfrpjjaaxr8j.ap-northeast-2.rds.amazonaws.com",
  user     : "admin",
  password : "20181441",
  database : "trashcan_management",
  port : 3306
});

connection.connect(function(err) {
    if(err) throw err;
    console.log('DB 연결');
});

let options = {
    extensions: ['htm', 'html'],
    index: ["index.html", "default.htm"],
}

app.use(express.static('public'));

router.get('/map', (req, res) => {
  const sql = "SELECT TRASHCAN_ID_PK, LOCATION_ADDR, LOCATION_LAT, LOCATION_LONG, TRASHCAN_LEVEL FROM location_tb INNER JOIN trashcan_tb ON location_tb.LOCATION_ID_PK = trashcan_tb.LOCATION_ID_FK"
  connection.query(sql, function (err, result, fields) {
      if (err) throw err;
      res.send(result)
  });
});

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

  const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, DATE_FORMAT(t.TRASHCAN_LAST_EMAIL, '%Y-%m-%d %H:%i:%s') as TRASHCAN_LAST_EMAIL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK WHERE a.ADMIN_RGN = ?`;
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
    const workbook = createExcelWorkbook(res, filteredResult, 'D', region);
  });
});

app.use('/', router);

app.listen(80);
