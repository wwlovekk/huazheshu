from PIL import Image, ImageDraw
from pathlib import Path

root = Path(__file__).resolve().parent
img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)
draw.rounded_rectangle((12,12,244,244),radius=58,fill='#6b7053')
draw.rounded_rectangle((64,58,196,202),radius=19,outline='#fafaf8',width=10)
draw.line((67,100,193,100),fill='#fafaf8',width=9)
for x in (96,164):
    draw.rounded_rectangle((x-5,43,x+5,77),radius=5,fill='#fafaf8')
draw.line((84,177,171,117),fill='#fafaf8',width=11)
draw.ellipse((79,172,89,182),fill='#fafaf8')
draw.ellipse((166,112,176,122),fill='#fafaf8')
img.save(root/'icon.png')
img.save(root/'icon.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
