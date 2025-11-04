/* -----------------------------------------------------------
   SISTEM SCAN WARNA TTI (KLIK TOMBOL + AKURASI TINGGI)
------------------------------------------------------------ */

// Referensi warna "Masih Layak"
const REF_COLOR = { r: 63, g: 17, b: 20 };
const DELTA_THRESHOLD = 18;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const resultDiv = document.getElementById("result");
const historyTable = document.getElementById("historyTable").querySelector("tbody");
const cameraSelect = document.getElementById("cameraSelect");

let historyData = JSON.parse(localStorage.getItem("scanHistory")) || [];
let rgbBuffer = [];
const MAX_BUFFER = 10;

// Kamera
async function startCamera(facingMode = "environment") {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode } });
  video.srcObject = stream;
}
startCamera();
cameraSelect.addEventListener("change", (e) => startCamera(e.target.value));

function rgbToXyz({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  r = r > 0.04045 ? ((r + 0.055)/1.055)**2.4 : r/12.92;
  g = g > 0.04045 ? ((g + 0.055)/1.055)**2.4 : g/12.92;
  b = b > 0.04045 ? ((b + 0.055)/1.055)**2.4 : b/12.92;
  return {
    x:(r*0.4124+g*0.3576+b*0.1805)*100,
    y:(r*0.2126+g*0.7152+b*0.0722)*100,
    z:(r*0.0193+g*0.1192+b*0.9505)*100
  };
}

function xyzToLab({x,y,z}) {
  x/=95.047; y/=100; z/=108.883;
  x=x>0.008856?x**(1/3):7.787*x+16/116;
  y=y>0.008856?y**(1/3):7.787*y+16/116;
  z=z>0.008856?z**(1/3):7.787*z+16/116;
  return {L:116*y-16, a:500*(x-y), b:200*(y-z)};
}

function rgbToLab(rgb){return xyzToLab(rgbToXyz(rgb));}

function deltaE2000(l1,l2){
  const avgLp=(l1.L+l2.L)/2;
  const C1=Math.sqrt(l1.a*l1.a+l1.b*l1.b);
  const C2=Math.sqrt(l2.a*l2.a+l2.b*l2.b);
  const avgC=(C1+C2)/2;
  const G=0.5*(1-Math.sqrt((avgC**7)/((avgC**7)+25**7)));
  const a1p=l1.a*(1+G); const a2p=l2.a*(1+G);
  const C1p=Math.sqrt(a1p*a1p+l1.b*l1.b);
  const C2p=Math.sqrt(a2p*a2p+l2.b*l2.b);
  const avgCp=(C1p+C2p)/2;
  let h1p=Math.atan2(l1.b,a1p)*180/Math.PI; if(h1p<0)h1p+=360;
  let h2p=Math.atan2(l2.b,a2p)*180/Math.PI; if(h2p<0)h2p+=360;
  let deltahp=h2p-h1p;
  if(Math.abs(deltahp)>180)deltahp+=deltahp>0?-360:360;
  const deltaLp=l2.L-l1.L;
  const deltaCp=C2p-C1p;
  const deltaHp=2*Math.sqrt(C1p*C2p)*Math.sin((deltahp/2)*Math.PI/180);
  const avgHp=Math.abs(h1p-h2p)>180?(h1p+h2p+360)/2:(h1p+h2p)/2;
  const T=1-0.17*Math.cos((avgHp-30)*Math.PI/180)+0.24*Math.cos((2*avgHp)*Math.PI/180)
         +0.32*Math.cos((3*avgHp+6)*Math.PI/180)-0.20*Math.cos((4*avgHp-63)*Math.PI/180);
  const deltaRo=30*Math.exp(-((avgHp-275)/25)**2);
  const Rc=2*Math.sqrt((avgCp**7)/((avgCp**7)+25**7));
  const Sl=1+(0.015*((avgLp-50)**2))/Math.sqrt(20+(avgLp-50)**2);
  const Sc=1+0.045*avgCp;
  const Sh=1+0.015*avgCp*T;
  const Rt=-Math.sin(2*(deltaRo*Math.PI/180))*Rc;
  return Math.sqrt((deltaLp/Sl)**2+(deltaCp/Sc)**2+(deltaHp/Sh)**2+Rt*(deltaCp/Sc)*(deltaHp/Sh));
}

function scanColor(){
  const w=video.videoWidth, h=video.videoHeight;
  canvas.width=w; canvas.height=h;
  ctx.drawImage(video,0,0,w,h);
  const size=100, x=w/2-size/2, y=h/2-size/2;
  const data=ctx.getImageData(x,y,size,size).data;
  let r=0,g=0,b=0,count=0;
  for(let i=0;i<data.length;i+=4){r+=data[i];g+=data[i+1];b+=data[i+2];count++;}
  return {r:r/count,g:g/count,b:b/count};
}

function smoothRGB(rgb){
  rgbBuffer.push(rgb);
  if(rgbBuffer.length>MAX_BUFFER)rgbBuffer.shift();
  const sum=rgbBuffer.reduce((t,v)=>({r:t.r+v.r,g:t.g+v.g,b:t.b+v.b}),{r:0,g:0,b:0});
  const n=rgbBuffer.length;
  return {r:sum.r/n, g:sum.g/n, b:sum.b/n};
}

function evaluate(rgb){
  const lab1=rgbToLab(rgb);
  const lab2=rgbToLab(REF_COLOR);
  const dE=deltaE2000(lab1,lab2);
  if(dE<=DELTA_THRESHOLD) return {name:"Masih Layak",price:15000,delta:dE};
  else return {name:"Tidak Layak",price:0,delta:dE};
}

document.getElementById("scanBtn").addEventListener("click",()=>{
  const rgb=scanColor();
  const smooth=smoothRGB(rgb);
  const result=evaluate(smooth);

  resultDiv.innerHTML=`
    <h3>Hasil Scan</h3>
    <p>Kategori: <strong>${result.name}</strong></p>
    <p>Harga: <strong>Rp ${result.price.toLocaleString()}</strong></p>
    <p>ΔE: ${result.delta.toFixed(2)}</p>
    <p>RGB Stabil: (${smooth.r.toFixed(0)}, ${smooth.g.toFixed(0)}, ${smooth.b.toFixed(0)})</p>
  `;

  const record={
    time:new Date().toLocaleString(),
    rgb:`(${Math.round(smooth.r)}, ${Math.round(smooth.g)}, ${Math.round(smooth.b)})`,
    quality:result.name,
    price:result.price
  };

  historyData.push(record);
  localStorage.setItem("scanHistory", JSON.stringify(historyData));
  renderHistory();
});

function renderHistory(){
  historyTable.innerHTML="";
  historyData.forEach(item=>{
    historyTable.innerHTML+=`
      <tr>
        <td>${item.time}</td>
        <td>${item.rgb}</td>
        <td>${item.quality}</td>
        <td>Rp ${item.price.toLocaleString()}</td>
      </tr>
    `;
  });
}
renderHistory();
