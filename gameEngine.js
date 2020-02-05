/*
    Javascript Game Engine
    By Frank Force 2019

    Engine Features
    - Engine is separate from game code, I kept it super simple.
    - Object oriented system with base class game object.
    - Base class object handles physics, collision, rendering, shadows, etc.
    - Objects collide with level tiles and can bounce off.
    - Engine helper classes and functions like Vector2, Color, and Timer.
    - Level is composed of a grid of tiles that can optionally have objects on them (bushes/rocks)
    - Automatically tiles level based on what is there.
    - Level & ground is cached to offscreen buffer, so all the level, trees, blood splats is only 1 draw call.
    - Sound effects audio with my tiny sound lib zzfx.
    - Input processing system.
    - A simple particle effect system.
*/

///////////////////////////////////////////////////////////////////////////////
// config
'use strict';

///////////////////////////////////////////////////////////////////////////////
// helper functions

let RGBA             = (r=0,g=0,b=0,a=1)=>(`rgba(${r*255|0},${g*255|0},${b*255|0},${a})`);
let PI               = Math.PI;
let Rand             = (m=1)=>Math.random()*m;
let RandInt          = m=>Rand(m)|0;
let RandBetween      = (a,b)=>a+Rand(b-a);
let RandIntBetween   = (a,b)=>a+RandInt(b-a+1);
let RandVector       = (scale=1)=>     (new Vector2(scale,0)).Rotate(Rand(2*PI));
let RandColorBetween = (c1,c2)=>       c1.Clone().Lerp(c2,Rand());
let IsArrayValid     = (x,y,size)=>    (x>=0 && y>=0 && x < size && y < size);

let Min=(a, b)=>                       (a<b)? a : b;
let Max=(a, b)=>                       (a>b)? a : b;
let Clamp=(v, min, max)=>              Min(Max(v, min), max);
let Percent=(v, a, b)=>                (a==b)? 0 : Clamp((v-a)/(b-a), 0, 1);
let Lerp=(p, a, b)=>                   a + Clamp(p, 0, 1) * (b-a);
let FormatTime=(t)=>                   
{
    let s = (t|0)%60;
    return (t/60|0)+':'+(s<10?'0':'')+s;
}

class Timer 
{
    constructor()           { this.endTime=0; }
    Set(timeLeft=0)         { this.endTime = time + timeLeft; }
    Get()                   { return this.IsSet()? time - this.endTime : 1e9; }
    IsSet()                 { return this.endTime > 0; }
    UnSet()                 { this.endTime = 0; }
    Elapsed()               { return !this.IsSet() || time > this.endTime; }
    valueOf()               { return this.Get(); }
}
    
class Vector2 
{
    constructor(x=0, y=0) { this.x = x; this.y = y; }
    Copy(v)               { this.x = v.x; this.y = v.y; return this; }
    Clone(s=1)            { return (new Vector2(this.x, this.y)).Multiply(s); }
	Add(v)                { (v instanceof Vector2)? (this.x += v.x, this.y += v.y) : (this.x += v, this.y += v); return this;  }
	Subtract(v)           { (this.x -= v.x, this.y -= v.y) ; return this;  }
	Multiply(v)           { (v instanceof Vector2)? (this.x *= v.x, this.y *= v.y) : (this.x *= v, this.y *= v); return this;  }
	Set(x, y)             { this.x = x; this.y = y; return this;  }
    AddXY(x, y)           { this.x += x; this.y += y; return this;  }
    Normalize(scale=1)    { let l = this.Length(); return l > 0 ? this.Multiply(scale/l) : this.Set(scale,0); }
    ClampLength(length)   { let l = this.Length(); return l > length ? this.Multiply(length/l) : this; }
    Rotate(a)             { let c=Math.cos(a);let s=Math.sin(a);return this.Set(this.x*c - this.y*s,this.x*s - this.y*c); }
    Round()               { this.x = Math.round(this.x); this.y = Math.round(this.y); return this; }
    Length()              { return Math.hypot(this.x, this.y ); }
    Distance(v)           { return Math.hypot(this.x - v.x, this.y - v.y ); }
    Angle()               { return Math.atan2(this.y, this.x); };
    Rotation()            { return (Math.abs(this.x)>Math.abs(this.y))?(this.x>0?2:0):(this.y>0?1:3); }   
    Lerp(v,p)             { return this.Add(v.Clone().Subtract(this).Multiply(p)); }
    DotProduct(v)         { return this.x*v.x+this.y*v.y; }
}

class Color
{
    constructor(r=0,g=0,b=0,a=1) { this.r=r;this.g=g;this.b=b;this.a=a; }
    Copy(c)                      { this.r=c.r;this.g=c.g;this.b=c.b;this.a=c.a; return this; }
    Clone(s=1)                   { return new Color(this.r*s, this.g*s, this.b*s, this.a*s); }
    //Add(c)                     { this.r+=c.r;this.g+=c.g;this.b+=c.b;this.a+=c.a; return this; }
    Subtract(c)                  { this.r-=c.r;this.g-=c.g;this.b-=c.b;this.a-=c.a; return this; }
    //Multiply(c)                { (c instanceof Color)? (this.r*=c.r,this.g*=c.g,this.b*=c.b,this.a*=c.a) : (this.r*=c,this.g*=c,this.b*=c,this.a*=c); return this; } 
    SetAlpha(a)                  { this.a=a; return this; } 
    Lerp(c,p)                    { return c.Clone().Subtract(c.Clone().Subtract(this).Clone(1-p)); }
    RGBA()                       { return RGBA(this.r, this.g, this.b, this.a); }
}

///////////////////////////////////////////////////////////////////////////////
// game object

class GameObject 
{
    constructor(pos,tileX,tileY,size=.5,collisionSize=0,health=1) 
    { 
        this.pos = pos.Clone();
        this.tileX = tileX;
        this.tileY = tileY;
        this.size = new Vector2(size,size);
        this.collisionSize = collisionSize;
        this.health = health;
        this.healthMax = health;
        this.damageTimer = new Timer();
        this.lifeTimer = new Timer();
        this.lifeTimer.Set();
        this.velocity = new Vector2();
        this.angle = 0;
        this.angleVelocity = 0;
        this.damping = 1;
        this.mirror = 0;
        this.height = 0;
        this.renderOrder = 0;
        this.canBeDamaged = 1;
        
        gameObjects.push(this); 
    }
    
    Update() 
    {
        // apply velocity
        let oldPos = this.pos;
        let newPos = this.pos.Clone();
        newPos.Add(this.velocity);
        
        this.pos = newPos;
        
        // apply physics
        this.velocity.Multiply(this.damping);
        this.angle += this.angleVelocity;
        
        if (debugCollision)
            DebugRect(this.pos,new Vector2(this.collisionSize,this.collisionSize),'#F00');
    }
       
    Render() { DrawTile(this.pos,this.size,this.tileX,this.tileY,this.angle,this.mirror,this.height);}
    
    Heal(health)
    {
        if (this.IsDead())
            return 0;
        
        // apply healing
        let startHealth = this.health;
        this.health = Min(this.health+health,this.healthMax);
        return this.health - startHealth;
    }
    
    Damage(damage, damageObject) 
    {
        if (this.IsDead())// || this.GetDamageTime() < .5)
            return 0;
            
        // apply damage
        this.damageTimer.Set();
        let startHealth = this.health;
        this.health = Max(this.health-damage,0);
        if (!this.health)
            this.Kill();
            
        return startHealth - this.health;
    }
    
    ReflectDamage(direction){ return 0; }
    GetLifeTime()           { return this.lifeTimer.Get(); }
    GetDamageTime()         { return this.damageTimer.Get(); }
    GetDamageFlashPercent() { return Clamp(1- this.GetDamageTime()/this.damageFlashTime,0,1); }
    IsTouching(object)      { return this.Distance(object) < object.collisionSize + this.collisionSize; }
    IsDead()                { return !this.health; }
    Kill()                  { this.health = 0; this.Destroy(); }
    Destroy()               { gameObjects.splice(gameObjects.indexOf(this), 1); }
    Distance(object)     
    {
        // get distance between objects accounting for height 
        let p1 = this.pos; let p2 = object.pos;
        return Math.hypot(p1.x - p2.x, p1.y - p2.y, this.height - object.height); 
    }
}

///////////////////////////////////////////////////////////////////////////////
// core engine

let cameraScale = 1;
let cameraPos = new Vector2();
let frame = 0;
let time = 1;
let paused = 0;
let manualPaused = 0;
let timeDelta = 1/60;
let hitRenderPass = 0;
let mainCanvasContext;
let mainCanvasSize = new Vector2();
let tileSize = 8;
let lastUpdate = 0;
let timeBuffer = 0;
let hadInput = 0;

function EngineInit()
{
    // set the main canvas size to half size of the window
    mainCanvasContext = mainCanvas.getContext('2d');
    mainCanvasSize.Set(84,48);
    mainCanvas.width = mainCanvasSize.x;
    mainCanvas.height = mainCanvasSize.y;
    
    InitDebug();
}

function EngineUpdate()
{
    UpdateGamepads();
    
    // time regulation, in case running faster then 60 fps, though it causes judder
    let now = Date.now();
    if (lastUpdate && !capturer)
    {
        // limit to 60 fps
        let delta = now - lastUpdate;
        if (timeBuffer + delta < 0)
        {
            // running fast
            requestAnimationFrame(EngineUpdate);
            return;
        }
        
        timeBuffer += delta;
        timeBuffer -= timeDelta * 1e3;
        if (timeBuffer > timeDelta * 1e3)
            timeBuffer = 0; // if running too slow
    }
    lastUpdate = now;
    
    if (manualPaused && (gamepadButtonWasPressed[9] || KeyIsDown(27)))
    {
        gamepadButtonWasPressed[9] = 0;
        keyInputData[27].isDown = 0;
        manualPaused = 0;
    }

    paused = manualPaused || (!debug && !document.hasFocus() && hadInput);
    if (paused)
    {
        // prevent stuck input if focus is lost
        mouseIsDown = mouseWasDown = 0;
        keyInputData.map(k=>k.wasDown=k.isDown=0);
    }

    // fit canvas to window
    /*if (!captureMode)
        mainCanvasSize.Set(window.innerWidth/2,window.innerHeight/2);
    mainCanvas.width = mainCanvasSize.x;
    mainCanvas.height = mainCanvasSize.y;
    mainCanvasContext.imageSmoothingEnabled = 0;*/
    
    // get mouse world pos
    let m = mousePosWorld.Copy(mousePos);
    m.Subtract(mainCanvasSize.Clone(.5));
    m.Multiply(1/(cameraScale*tileSize));
    m.Add(cameraPos);
    
    // main update
    if (!paused)
    {
        // debug speed up / slow down
        let frames = 1;
        if (debug && KeyIsDown(107))
            frames = 4;
        if (debug && KeyIsDown(109))
            frames = (debugFrame%4==0);
        while(frames--)
        {
            time = 1+ ++frame * timeDelta
            
            
            UpdateFrame();
            
            
        
        //if (levelFrame >1 && !currentPlayerGhost[levelFrame-1])
            UpdateGameObjects();
        }
    }
        
    // main render
    let SortGameObjects = (a,b)=> a.renderOrder-b.renderOrder;
    gameObjects.sort(SortGameObjects);
    PreRender();
    RenderGameObjects();
    PostRender();
    UpdateDebug();
    
    // clear input
    mouseWasDown = mouseIsDown;
    keyInputData.map(k=>k.wasDown=k.isDown);
    requestAnimationFrame(EngineUpdate);

    UpdateDebugPost();
}

///////////////////////////////////////////////////////////////////////////////
// game object system

let gameObjects = [];
function ClearGameObjects()  { gameObjects = []; }
function UpdateGameObjects()
{ 
    // make copy so objects can be removed
    let gameObjectsCopy = gameObjects.slice();
    gameObjectsCopy.forEach(o=>o.Update());

}
function RenderGameObjects()
{ 
    gameObjects.forEach(o=>
    {
        o.Render();
        {
            // draw the hit flash overlay
            hitRenderPass = o.GetDamageFlashPercent();
            if (hitRenderPass)
            {
                o.Render();
                hitRenderPass = 0;
            }
        }
    });
}

///////////////////////////////////////////////////////////////////////////////
// input

let mouseMode = 0;
let mouseIsDown = 0;
let mouseWasDown = 0;
let keyInputData = [];
let mousePos = new Vector2();
let mousePosWorld = new Vector2();

let ControlsMultiplex=key=>
{
    switch(key)
    {
        case 87: return(38);
        case 83: return(40);
        case 65: return(37);
        case 68: return(39);
        case 104: return(38);
        case 98: return(40);
        case 100: return(37);
        case 102: return(39);
            
        case 16: return(32);
        case 101: return(32);
        case 96: return(32);   
    }
    
    return key;
}

//oncontextmenu = function(e) { e.preventDefault(); }
onmousedown   = function(e) { if (e.button!=0)return; mouseIsDown=1; mouseMode=1; hadInput=1; }
onmouseup     = function(e) { if (e.button!=0)return; mouseIsDown=0; hadInput=1; }
onmousemove   = function(e) 
{ 
    // convert mouse pos to canvas space
    let rect = mainCanvas.getBoundingClientRect();
    mousePos.Set
    ( 
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height
    ).Multiply(mainCanvasSize);
}
onkeydown = function(e) 
{ 
    if (debug && e.keyCode==192)
        e.preventDefault(),ToggleDebugConsole();
    if (debug && document.activeElement && document.activeElement.type == 'textarea')
        return;
        
    mouseMode = 0;
    let keyCode = ControlsMultiplex(e.keyCode); 
    keyInputData[keyCode]={isDown:1};
    isUsingGamepad=0;
    hadInput=1;
}
onkeyup = function(e) 
{ 
    if (debug && document.activeElement && document.activeElement.type == 'textarea')
        return;
        
    let keyCode = ControlsMultiplex(e.keyCode); 
    if ( keyInputData[keyCode] ) keyInputData[keyCode].isDown=0;
    hadInput=1;
}

function MouseWasPressed()  { return mouseIsDown && !mouseWasDown; }
function KeyIsDown(key)     { return keyInputData[key]? keyInputData[key].isDown : 0; }
function KeyWasPressed(key) { return KeyIsDown(key) && !keyInputData[key].wasDown; }
function ClearInput()       { keyInputData.map(k=>k.wasDown=k.isDown=0);mouseIsDown=mouseWasDown=0; }

///////////////////////////////////////////////////////////////////////////////
// rendering

function DrawScreenTile(x,y,size,tileX,tileY)
{
    mainCanvasContext.drawImage(tileImage,tileX*tileSize,tileY*tileSize,tileSize,tileSize, x-size, y-size, 2*size, 2*size);
}

function SetCanvasTransform(pos,size,angle=0,height=0)
{
    // create canvas transform from world space to screen space
    mainCanvasContext.save();
    let drawPos = pos.Clone();
    drawPos.y -= height;
    drawPos.Multiply(tileSize*cameraScale).Round();
    drawPos.Subtract(cameraPos.Clone(tileSize*cameraScale));
    drawPos.Add(mainCanvasSize.Clone(.5));
    mainCanvasContext.translate(drawPos.x|0, drawPos.y|0);
    
    let s = size.Clone(tileSize);
    if (angle)
        mainCanvasContext.rotate(angle);
    mainCanvasContext.scale(cameraScale,cameraScale);
}

function DrawTile(pos,size,tileX=0,tileY=0,angle=0,mirror=0,height=0,tilePixelSize=tileSize)
{
    // render a tile at a world space position
    SetCanvasTransform(pos,size,angle,height);
    
    let image = tileImage;

    // shrink size of tile to fix bleeding on edges
    let renderTileShrink = .25;
    
    /// render the tile
    let s = size.Clone(tileSize);
    mainCanvasContext.imageSmoothingEnabled = 0;
    mainCanvasContext.scale(mirror?-s.x:s.x,s.y);
    mainCanvasContext.drawImage(image,
        tileX*tilePixelSize+renderTileShrink,
        tileY*tilePixelSize+renderTileShrink,
        tilePixelSize-2*renderTileShrink,
        tilePixelSize-2*renderTileShrink, -.5, -.5, 1, 1);
    mainCanvasContext.restore();
    mainCanvasContext.globalAlpha = 1;   
}

/*
function DrawText(text, x, y, size,textAlign='center',lineWidth=1,color='#000',strokeColor='#fff',context=mainCanvasContext)
{
    context.fillStyle=color;
    context.font = `900 ${size}px arial`
    context.textAlign=textAlign;
    context.textBaseline='middle';
    context.fillText(text,x,y);
    if (lineWidth)
    {
        context.lineWidth=lineWidth;
        context.strokeStyle=strokeColor;
        context.strokeText(text,x,y);
    }
}*/

///////////////////////////////////////////////////////////////////////////////
// particle system
 
class Particle
{
    constructor(emitter,pos,velocity,size,lifeTime,startColor,endColor)
    {
        this.emitter = emitter;
        this.pos = pos;
        this.velocity = velocity;
        this.size = size;
        this.lifeTime = lifeTime;
        this.startColor = startColor;
        this.endColor = endColor;
        this.lifeTimer = new Timer();
        this.lifeTimer.Set();
    }

    Update()
    {
        // update physics
        this.pos.Add(this.velocity.Multiply(.9));
        
        // remove if dead
        if (this.lifeTimer.Get() > this.lifeTime)
             this.emitter.particles.splice(this.emitter.particles.indexOf(this),1);
        
        if (debugCollision)
            DebugRect(this.pos, new Vector2(this.size,this.size), '#0FF');
    }
    
    Render()
    {
        // get the color
        let p = Percent(this.lifeTimer.Get(), 0, this.lifeTime);
        let c = this.startColor.Clone().Lerp(this.endColor, p);
        //c.a *= p<.1? p /.1 : 1; // fade in alpha
        c.a = 1;
        mainCanvasContext.fillStyle=c.RGBA();
            
        // get the size
        let size = this.size * cameraScale * tileSize * Lerp(p,1,0);
    
        // get the screen pos and render
        let pos = this.pos.Clone()
            .Subtract(cameraPos)
            .Multiply(tileSize*cameraScale)
            .Add(mainCanvasSize.Clone(.5))
            .Add(-size);
        mainCanvasContext.fillRect(pos.x|0, pos.y|0, 2*size|0, 2*size|0);
    }
}

class ParticleEmitter extends GameObject
{
    constructor( pos, emitSize, particleSize, color1, color2 ) 
    {
        super(pos,0,0,emitSize);
        this.particleSize=particleSize;
        this.color1=color1.Clone();
        this.color2=color2.Clone();
        this.particles=[];
        this.emitTimeBuffer=0;
    }
    
    Update()
    {
        // update particles
        this.particles.forEach(particle=>particle.Update());
        
        if (this.GetLifeTime() <= .05)
        {
            // emit new particles
            let secondsPerEmit = 1/200;
            this.emitTimeBuffer += timeDelta;
            while (this.emitTimeBuffer > secondsPerEmit)
            {
                this.emitTimeBuffer -= secondsPerEmit;
                this.AddParticle();
            }
        }
        else if (!this.particles.length)
        {
            // go away when all particles are gone
            this.Destroy();
        }
            
        if (debugCollision)
            DebugRect(this.pos, new Vector2(this.size,this.size), '#00F');
            
        super.Update();
    }
    
    Render() { this.particles.forEach(p=>p.Render()); }
    
    AddParticle()
    { 
        // create a new particle with random settings
        this.particles.push
        (
            new Particle
            (
                this,
                this.pos.Clone().Add(RandVector(Rand(this.size.x))),
                RandVector(Rand(.2)),
                RandBetween(this.particleSize,2*this.particleSize),
                RandBetween(.5,1),
                RandColorBetween(this.color1,this.color2),
                RandColorBetween(this.color1,this.color2).SetAlpha(0)
            )
        );
    }
}

////////////////////////////////////////////////////////////////////
// gamepad API

let isUsingGamepad = 0;
let gamepadLeft = new Vector2();
let gamepadRight = new Vector2();
let gamepadButtonIsDown = [];
let gamepadButtonWasPressed = [];
let deadZone = .3;
let maxZone = .8;

function ApplyDeadZone(v)
{
    if (v>deadZone)
        return (v-=deadZone)>maxZone? 1 : v/(maxZone-deadZone);
    else if (v<-deadZone)
        return (v+=deadZone)<-maxZone? -1 : v/(maxZone-deadZone);
    return 0;
}

function UpdateGamepads()
{
    if (!("getGamepads" in navigator))
        return;

    let gamepad = navigator.getGamepads()[0];
    if (gamepad && gamepad.axes.length>=4 && gamepad.buttons.length>=1)
    {
        gamepadLeft.x = ApplyDeadZone(gamepad.axes[0]);
        gamepadLeft.y = ApplyDeadZone(gamepad.axes[1]);
        gamepadRight.x = ApplyDeadZone(gamepad.axes[2]);
        gamepadRight.y = ApplyDeadZone(gamepad.axes[3]);
        if (Math.abs(gamepadLeft.x)+Math.abs(gamepadLeft.y)>.6)
            isUsingGamepad=1;
        
        for(let i=16; i--;)
        {
            gamepadButtonWasPressed[i] = !gamepadButtonIsDown[i] && gamepad.buttons[i].pressed;
            gamepadButtonIsDown[i] = gamepad.buttons[i].pressed;
            if (gamepadButtonIsDown[i])
                isUsingGamepad=1;
        }
        
        if (gamepadButtonIsDown[12]||gamepadButtonIsDown[13]||gamepadButtonIsDown[14]||gamepadButtonIsDown[15])
        {
            // dpad
            gamepadLeft.Set(0,0);
            if (gamepadButtonIsDown[12])
                gamepadLeft.y -= 1;
            if (gamepadButtonIsDown[13])
                gamepadLeft.y += 1;
            if (gamepadButtonIsDown[14])
                gamepadLeft.x -= 1;
            if (gamepadButtonIsDown[15])
                gamepadLeft.x += 1;
            gamepadLeft.Normalize();
        }
        
        gamepadButtonIsDown[2] |= gamepadButtonIsDown[7];
        gamepadButtonWasPressed[2] |= gamepadButtonWasPressed[7];
        gamepadButtonIsDown[0] |= gamepadButtonIsDown[6];
        gamepadButtonWasPressed[0] |= gamepadButtonWasPressed[6];
        
    }
    
    if (!isUsingGamepad)
    {
        gamepadLeft.Set(0,0);
        gamepadRight.Set(0,0);
        for(let b of gamepadButtonIsDown)
            b = 0;
        for(let b of gamepadButtonWasPressed)
            b = 0;
    }
    
    if (isUsingGamepad)
    {
        hadInput=1;
        mouseMode = 0;
    }
}