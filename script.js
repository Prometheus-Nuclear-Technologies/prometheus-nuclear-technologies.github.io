// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Intersection Observer for Scroll Animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: "0px 0px -50px 0px"
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe timeline items, cards, team cards, and other elements
document.querySelectorAll('.timeline-item, .card, .team-card, .content-grid > div, .stat, .ods-badge').forEach(el => {
    observer.observe(el);
    if (!el.classList.contains('timeline-item')) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'all 0.6s ease-out';
    }
});

// Dynamic header background on scroll with enhanced effects
const header = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        header.style.background = 'rgba(5, 11, 20, 0.98)';
        header.style.boxShadow = '0 8px 32px rgba(0, 242, 255, 0.1)';
        header.style.borderBottomColor = 'rgba(0, 242, 255, 0.4)';
    } else {
        header.style.background = 'rgba(5, 11, 20, 0.95)';
        header.style.boxShadow = '0 8px 32px rgba(0, 242, 255, 0.05)';
        header.style.borderBottomColor = 'rgba(0, 242, 255, 0.2)';
    }
});

// Active nav link highlighting
window.addEventListener('scroll', () => {
    let current = '';
    const sections = document.querySelectorAll('section');
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        
        if (pageYOffset >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });
    
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').slice(1) === current) {
            link.classList.add('active');
        }
    });
});

// Add CSS for active nav link
const style = document.createElement('style');
style.textContent = `
    .nav-links a.active {
        color: var(--primary-accent);
        border-bottom: 2px solid var(--primary-accent);
        padding-bottom: 0.5rem;
    }
`;
document.head.appendChild(style);
