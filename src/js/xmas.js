import Snowfall from 'snowfall-animation'

window.addEventListener('load', (evt) => {
    const configs = {
        element: '#xmas-bg',
        number: 50,
        speed: 10,
        radius: 4,
    };
    const snowfall = new Snowfall(configs);
    snowfall.init();
});