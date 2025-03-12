import React, { ReactNode, useEffect, useState, RefObject } from 'react';
import { useKeenSlider, KeenSliderPlugin, KeenSliderInstance } from 'keen-slider/react';

import 'keen-slider/keen-slider.min.css';
import './slider.css';

interface SliderProps {
	images: ReactNode[];
	thumbnails: ReactNode[];
}

function ThumbnailPlugin(mainRef: RefObject<KeenSliderInstance | null>): KeenSliderPlugin {
	return (slider) => {
		function removeActive() {
			slider.slides.forEach((slide) => slide.classList.remove('active'));
		}

		function addActive(idx: number) {
			if (slider.slides[idx]) {
				slider.slides[idx].classList.add('active');
			}
		}

		function addClickEvents() {
			slider.slides.forEach((slide, idx) => {
				slide.onclick = () => {
					if (mainRef.current) mainRef.current.moveToIdx(idx);
				};
			});
		}

		slider.on('created', () => {
			if (!mainRef.current) return;
			addActive(slider.track.details.rel);
			addClickEvents();
			mainRef.current.on('animationStarted', (main) => {
				removeActive();
				const next = main.animator.targetIdx || 0;
				addActive(main.track.absToRel(next));
				slider.moveToIdx(Math.min(slider.track.details.maxIdx, next));
			});
		});

		// 🔹 Attach click events again when slides change
		slider.on('updated', () => {
			addClickEvents();
		});
	};
}

export default function Slider({ images, thumbnails }: SliderProps) {
	const [sliderRef, instanceRef] = useKeenSlider<HTMLDivElement>({
		initial: 0,
	});

	const [thumbnailRef, thumbnailInstanceRef] = useKeenSlider<HTMLDivElement>(
		{
			initial: 0,
			slides: {
				perView: 4,
				spacing: 10,
			},
		},
		[ThumbnailPlugin(instanceRef)],
	);

	// 🔹 Force reinitialization when images change
	useEffect(() => {
		instanceRef.current?.update();
		thumbnailInstanceRef.current?.update();
	}, [images]);

	return (
		<>
			<div ref={sliderRef} className='keen-slider min-h-[300px] w-full'>
				{images.map((image, index) => (
					<div key={index} className='keen-slider__slide'>
						{image}
					</div>
				))}
			</div>

			<div ref={thumbnailRef} className='keen-slider thumbnail'>
				{thumbnails.map((thumb, index) => (
					<div key={index} className='keen-slider__slide'>
						{thumb}
					</div>
				))}
			</div>
		</>
	);
}
