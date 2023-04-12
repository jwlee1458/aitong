const express = require('express');
const app = express();
const router = express.Router();

const mysql = require('mysql');

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

app.use('/', router);

app.listen(3000);
