# SnapTunes React Version
A frontend scaffold for SnapTunes built in React + JavaScript

## Dependencies
- **React** for the framework
- **react-icons** for UI icons
- **Materials UI (MUI)** for input
- **p5js** for NoteSpace drawing

### Features
SnapTunes React has full frontend implementation, with interactable buttons and sliders, as well as a partially functioning drawing tool (draw, undo, clear all). I've included some setup for integration with the backend (via React contexts) that you can use if you like. 

If you're unfamiliar with React contexts, check out the React [Docs](https://react.dev/learn/passing-data-deeply-with-context). In short, contexts allows us to pass data between components in the same level, without having to pass data back up to the parent, and having the parent pass data back down to other components (gets messy fast!!)

Consider this hierarchy graph:

**index**
|
**App**
|
**TopBar** - **NoteSpace** - **ControlPanel**

With how the context file is setup, buttons in the **TopBar** and **ControlPanel** can change the state of the canvas in NoteSpace without having to pass anything up one level to App!

Without having to dive into the code, here's a little guide on how I've split up the contexts, and the reasoning behind this:

octave, clear {App}

all others {TopBar, NoteSpace, ControlPanel}

_Octave_ and _Clear_ contexts are at the **App.jsx** level because we had planned two clientside tangible interactions: shake to clear, and tilt to change octave. Accelerometer/Gyroscope data should be handled at the App level, so App should have access to these contexts.

I set up two different context files, one for SimSnap hooks, and the other for purely clientside data. Currently, there is no integration between SimSnap and the UI, but many features should be easily transferred between ver. 1.0 and ver. React.

### Future Direction
As there is no backend implementation yet, I do have some ideas that you can use to start. We've transitioned from SnapTunes 1.0's drag & drop to a drawing based interaction. The issue now is to determine how to detect drawn notes. 

The naive way to approach this would be to iterate from x = 0 (plus the space the keyboard on the left side takes up) to x = containerRef.current.offsetWidth, and check melodyArr for any points that lie on, or intersect with the current x. For any points that satisfy this contstraint, use its y value (or calculated y value) to play the appropriate note or tune.

Another possible route to go is splitting the NoteSpace into a grid along the notes and beats, and checking if any points lie inside or cross between cells. This is a little limiting on its own, but much more performant.

If implementing vibrato or smooth pitch change between notes, you would likely want to run another thing on top to determine line slope or point variation

Please feel free to change up anything your team decides to, and good luck!

Snowie