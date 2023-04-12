const express = require('express');
const app = express();
const router = express.Router();
const mysql = require('mysql');
const excel = require('exceljs');
const fs = require('fs');

const connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : '0903',
  database : 'trashcan_management'
});

connection.connect(function(err) {
    if(err) throw err;
    console.log('Connected DB');
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

router.get('/allfile', (req, res) => {
  const sql = "SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK";
  connection.query(sql, function (err, result, fields) {
    if (err) throw err;

      // 80% 이상인 데이터 필터링
      const filteredResult = result.filter(item => item.TRASHCAN_LEVEL >= 80);

      // 엑셀 워크북 생성
      const workbook = new excel.Workbook();

      // 워크시트 생성
      const worksheet = workbook.addWorksheet('Filtered Trash Cans');

      // 엑셀 헤더 작성
      worksheet.columns = [
        { header: '쓰레기통 아이디', key: 'TRASHCAN_ID_PK', width: 20},
        { header: '현재 수용량', key: 'TRASHCAN_LEVEL', width: 20},
        { header: '주소', key: 'LOCATION_ADDR', width: 35},
        { header: '위도', key: 'LOCATION_LAT', width: 13},
        { header: '경도', key: 'LOCATION_LONG', width: 13},
        { header: '관리자 아이디', key: 'ADMIN_ID_PK', width: 20},
        { header: '관리자 행정구역', key: 'ADMIN_RGN', width: 22}
      ];

      // 헤더 색상 변경
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'D9D9D9' },
        bgColor: { argb: 'D9D9D9' }
      };

      // 엑셀 데이터 작성
      worksheet.addRows(filteredResult);

      // 엑셀 파일 저장
      workbook.xlsx.writeFile('filtered_trash_cans.xlsx')
      .then(function() {
        console.log('Filtered trash cans exported successfully!');
        const file = `${__dirname}/filtered_trash_cans.xlsx`;
        res.download(file, function (err) {
          if (err) {
            console.log('Error downloading file!', err);
          } else {
            fs.unlinkSync(file); // 파일 삭제
          }
        });
      })
      .catch(function(error) {
        console.log('Error exporting filtered trash cans!', error);
      });
  });
});

router.get('/file/:region', (req, res) => {
  const region = req.params.region;
  const sql = `SELECT t.TRASHCAN_ID_PK, l.LOCATION_ADDR, l.LOCATION_LAT, l.LOCATION_LONG, t.TRASHCAN_LEVEL, a.ADMIN_ID_PK, a.ADMIN_RGN FROM location_tb l INNER JOIN trashcan_tb t ON l.LOCATION_ID_PK = t.LOCATION_ID_FK INNER JOIN admin_tb a ON t.ADMIN_ID_FK = a.ADMIN_ID_PK WHERE a.ADMIN_RGN = ?`;
  connection.query(sql, [region], function (err, result, fields) {
    if (err) throw err;

    // 80% 이상인 데이터 필터링
    const filteredResult = result.filter(item => item.TRASHCAN_LEVEL >= 80);

    // 엑셀 워크북 생성
    const workbook = new excel.Workbook();

    // 워크시트 생성
    const worksheet = workbook.addWorksheet(`${region} 지역 포화 쓰레기통`);

    // 엑셀 헤더 작성
    worksheet.columns = [
      { header: '쓰레기통 아이디', key: 'TRASHCAN_ID_PK', width: 20},
      { header: '현재 수용량', key: 'TRASHCAN_LEVEL', width: 20},
      { header: '주소', key: 'LOCATION_ADDR', width: 35},
      { header: '위도', key: 'LOCATION_LAT', width: 13},
      { header: '경도', key: 'LOCATION_LONG', width: 13},
      { header: '관리자 아이디', key: 'ADMIN_ID_PK', width: 20},
      { header: '관리자 행정구역', key: 'ADMIN_RGN', width: 22}
    ];

    // 헤더 색상 변경
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'D9D9D9' },
      bgColor: { argb: 'D9D9D9' }
    };

    // 엑셀 데이터 작성
    worksheet.addRows(filteredResult);

    // 엑셀 파일 저장
    const fileName = `${region}_포화_쓰레기통.xlsx`;
    workbook.xlsx.writeFile(fileName)
    .then(function() {
      console.log('Filtered trash cans exported successfully!');
      const file = `${__dirname}/${fileName}`;
      res.download(file, function (err) {
        if (err) {
          console.log('Error downloading file!', err);
        } else {
          fs.unlinkSync(file); // 파일 삭제
        }
      });
    })
    .catch(function(error) {
      console.log('Error exporting filtered trash cans!', error);
    });
  });
});

app.use('/', router);

app.listen(3000);
